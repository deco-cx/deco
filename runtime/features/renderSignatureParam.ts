/**
 * The `/deco/render` signature's query param and inputs, apart from the signer
 * (renderSignature.ts) so `useSection` can name them without importing
 * node:crypto into a module islands may reach.
 */

export const RENDER_SIGNATURE_PARAM = "__sig";

export interface RenderSignatureInput {
  /** Raw `props` query value, exactly as sent. */
  props: string;
  /** Raw `resolveChain` query value, if any. */
  resolveChain?: string | null;
  /** Raw `pathTemplate` query value. */
  pathTemplate: string;
}
