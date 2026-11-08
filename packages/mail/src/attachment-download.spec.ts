import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { downloadAttachment, isNonPublicAddress } from './attachment-download';

let server: Server;
let port: number;

beforeAll(async () => {
  server = createServer((req, res) => {
    switch (req.url) {
      case '/report.pdf':
        res.writeHead(200, { 'content-type': 'application/pdf' });
        return res.end('%PDF');
      case '/declared-large':
        res.writeHead(200, { 'content-length': '100' });
        return res.end('x'.repeat(100));
      case '/streamed-large': {
        // chunked, no Content-Length: the cap must be enforced while streaming
        res.writeHead(200);
        const timer = setInterval(() => res.write('x'.repeat(64)), 5);
        res.on('close', () => clearInterval(timer));
        return;
      }
      case '/hang':
        res.writeHead(200);
        res.write('partial');
        return; // never ends
      case '/redirect':
        res.writeHead(302, { location: '/report.pdf' });
        return res.end();
      default:
        res.writeHead(404);
        return res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

const local = { allowHttp: true, allowPrivateHosts: true };

describe('downloadAttachment', () => {
  it('downloads the body with its content type', async () => {
    const out = await downloadAttachment(`http://127.0.0.1:${port}/report.pdf`, local);
    expect(out.content.toString()).toBe('%PDF');
    expect(out.contentType).toBe('application/pdf');
  });

  it('refuses http: by default', async () => {
    await expect(downloadAttachment(`http://127.0.0.1:${port}/report.pdf`)).rejects.toThrow(
      /must be https.*allowHttp/,
    );
  });

  it('refuses other schemes', async () => {
    await expect(downloadAttachment('file:///etc/passwd', local)).rejects.toThrow(/must be https/);
  });

  it('refuses a private IP literal by default, even over https', async () => {
    await expect(downloadAttachment('https://169.254.169.254/latest/meta-data')).rejects.toThrow(
      /non-public address/,
    );
    await expect(downloadAttachment('https://[::1]/x')).rejects.toThrow(/non-public address/);
  });

  it('refuses a hostname that resolves to a private address (checked at connect time)', async () => {
    await expect(
      downloadAttachment(`http://localhost:${port}/report.pdf`, { allowHttp: true }),
    ).rejects.toThrow(/localhost resolves to a non-public address/);
  });

  it('caps the size from Content-Length', async () => {
    await expect(
      downloadAttachment(`http://127.0.0.1:${port}/declared-large`, { ...local, maxBytes: 10 }),
    ).rejects.toThrow(/larger than the 10-byte limit/);
  });

  it('caps the size while streaming', async () => {
    await expect(
      downloadAttachment(`http://127.0.0.1:${port}/streamed-large`, { ...local, maxBytes: 1000 }),
    ).rejects.toThrow(/larger than the 1000-byte limit/);
  });

  it('times out a download that never finishes', async () => {
    await expect(
      downloadAttachment(`http://127.0.0.1:${port}/hang`, { ...local, timeoutMs: 100 }),
    ).rejects.toThrow(/timed out after 100ms/);
  });

  it('does not follow redirects', async () => {
    await expect(downloadAttachment(`http://127.0.0.1:${port}/redirect`, local)).rejects.toThrow(
      /status 302 \(redirects are not followed\)/,
    );
  });

  it('fails on a non-2xx status', async () => {
    await expect(downloadAttachment(`http://127.0.0.1:${port}/missing`, local)).rejects.toThrow(
      /status 404/,
    );
  });
});

describe('isNonPublicAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    '::',
    'fe80::1',
    'fd00::1',
    '::ffff:127.0.0.1',
    '::ffff:a9fe:a9fe',
    'not-an-ip',
  ])('%s is not public', (address) => {
    expect(isNonPublicAddress(address)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '::ffff:8.8.8.8'])(
    '%s is public',
    (address) => {
      expect(isNonPublicAddress(address)).toBe(false);
    },
  );
});
