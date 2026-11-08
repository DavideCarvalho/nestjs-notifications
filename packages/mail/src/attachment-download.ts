import { type LookupAddress, lookup as dnsLookup } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { BlockList, isIP } from 'node:net';

/** How the mail channel downloads `url` attachments. */
export interface AttachmentDownloadOptions {
  /** Abort a download that has not finished within this many ms. Default `30_000`. */
  timeoutMs?: number;
  /**
   * Refuse a file larger than this many bytes (checked against `Content-Length` and while
   * streaming). Default `25 * 1024 * 1024` (25 MiB, the common mail-provider message limit).
   */
  maxBytes?: number;
  /** Allow `http:` URLs. Default `false`: only `https:`. */
  allowHttp?: boolean;
  /**
   * Allow hosts that resolve to loopback, private, link-local (cloud metadata), CGNAT, multicast
   * or otherwise non-public addresses. Default `false`: every address the host resolves to is
   * checked when the connection is made (so DNS rebinding can't swap one in after the check).
   * Turn this on for an internal file server you trust.
   */
  allowPrivateHosts?: boolean;
}

export const DEFAULT_ATTACHMENT_TIMEOUT_MS = 30_000;
export const DEFAULT_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;

const nonPublic = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8], // "this" network
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local (cloud metadata)
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.88.99.0', 24], // 6to4 relay
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast
] as const) {
  nonPublic.addSubnet(net, prefix, 'ipv4');
}
for (const [net, prefix] of [
  ['::', 128], // unspecified
  ['::1', 128], // loopback
  ['64:ff9b::', 96], // NAT64 (embeds an IPv4 address)
  ['64:ff9b:1::', 48], // local-use NAT64
  ['100::', 64], // discard
  ['2001::', 23], // IETF protocol assignments (Teredo, ...)
  ['2001:db8::', 32], // documentation
  ['2002::', 16], // 6to4 (embeds an IPv4 address)
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['fec0::', 10], // site-local (deprecated)
  ['ff00::', 8], // multicast
] as const) {
  nonPublic.addSubnet(net, prefix, 'ipv6');
}

/** Whether `address` (an IP literal) is loopback, private, link-local or otherwise not public. */
export function isNonPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return nonPublic.check(address, 'ipv4');
  if (family !== 6) return true;
  const lower = address.toLowerCase();
  // IPv4-mapped / -compatible IPv6 (`::ffff:10.0.0.1`, `::ffff:a00:1`): check the embedded IPv4.
  const mapped = /^::(?:ffff:)?(?:(\d+\.\d+\.\d+\.\d+)|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/.exec(
    lower,
  );
  if (mapped) {
    const v4 =
      mapped[1] ??
      [Number.parseInt(mapped[2] as string, 16), Number.parseInt(mapped[3] as string, 16)]
        .flatMap((word) => [word >> 8, word & 0xff])
        .join('.');
    return nonPublic.check(v4, 'ipv4');
  }
  return nonPublic.check(lower, 'ipv6');
}

/** A DNS lookup that fails the connection when the host resolves to a non-public address. */
const publicOnlyLookup: NonNullable<http.RequestOptions['lookup']> = (
  hostname,
  options,
  callback,
) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return (callback as any)(err);
    const list = addresses as unknown as LookupAddress[];
    const blocked = list.find((a) => isNonPublicAddress(a.address));
    if (blocked || list.length === 0) {
      return (callback as any)(
        new Error(
          `Mail attachment host ${hostname} resolves to a non-public address (${blocked?.address ?? 'none'}); set attachments.allowPrivateHosts to allow it.`,
        ),
      );
    }
    if ((options as { all?: boolean }).all) return (callback as any)(null, list);
    const first = list[0] as LookupAddress;
    return (callback as any)(null, first.address, first.family);
  });
};

/**
 * Downloads a `url` attachment: https only (unless `allowHttp`), public addresses only (unless
 * `allowPrivateHosts`), no redirects, a timeout over the whole download, and a size cap enforced
 * while streaming.
 */
export async function downloadAttachment(
  url: string,
  options: AttachmentDownloadOptions = {},
): Promise<{ content: Buffer; contentType: string | undefined }> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_ATTACHMENT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_ATTACHMENT_MAX_BYTES;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Mail attachment url is not a valid URL: ${url}`);
  }
  const isHttps = parsed.protocol === 'https:';
  if (!isHttps && !(parsed.protocol === 'http:' && options.allowHttp)) {
    throw new Error(
      `Mail attachment url must be https: ${url}${parsed.protocol === 'http:' ? ' (set attachments.allowHttp to allow http:)' : ''}`,
    );
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  // An IP literal never goes through `lookup`, so check it here.
  if (!options.allowPrivateHosts && isIP(host) && isNonPublicAddress(host)) {
    throw new Error(
      `Mail attachment host ${host} is a non-public address; set attachments.allowPrivateHosts to allow it.`,
    );
  }

  const client = isHttps ? https : http;
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      req.destroy();
      reject(error);
    };
    const timer = setTimeout(
      () =>
        fail(new Error(`Downloading the mail attachment ${url} timed out after ${timeoutMs}ms.`)),
      timeoutMs,
    );
    const req = client.get(
      parsed,
      options.allowPrivateHosts ? {} : { lookup: publicOnlyLookup },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status < 200 || status >= 300) {
          res.resume();
          return fail(
            new Error(
              `Downloading the mail attachment ${url} failed with status ${status}${status >= 300 && status < 400 ? ' (redirects are not followed).' : '.'}`,
            ),
          );
        }
        const tooLarge = () =>
          new Error(`The mail attachment ${url} is larger than the ${maxBytes}-byte limit.`);
        const declared = Number(res.headers['content-length']);
        if (Number.isFinite(declared) && declared > maxBytes) return fail(tooLarge());
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) return fail(tooLarge());
          chunks.push(chunk);
        });
        res.on('error', (err) => fail(err));
        res.on('end', () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          const contentType = res.headers['content-type'];
          resolve({ content: Buffer.concat(chunks), contentType: contentType || undefined });
        });
      },
    );
    req.on('error', (err) => fail(err));
  });
}
