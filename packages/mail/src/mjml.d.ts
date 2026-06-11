/**
 * Minimal ambient declaration for the optional `mjml` peer — it ships no types and is
 * imported lazily by {@link MjmlMailRenderer}.
 */
declare module 'mjml' {
  interface MjmlOptions {
    minify?: boolean;
    validationLevel?: 'strict' | 'soft' | 'skip';
    [key: string]: unknown;
  }
  interface MjmlResult {
    html: string;
    errors: unknown[];
  }
  const mjml2html: (mjml: string, options?: MjmlOptions) => MjmlResult;
  export default mjml2html;
}
