import { createHmac, timingSafeEqual } from "node:crypto";
import { logger } from "../../observability/mod.ts";
import type { RenderSignatureInput } from "./renderSignatureParam.ts";

export {
  RENDER_SIGNATURE_PARAM,
  type RenderSignatureInput,
} from "./renderSignatureParam.ts";

/**
 * Signs the `/deco/render` parameters that decide what the server resolves.
 *
 * `/deco/render` is public: it resolves `props` (optionally rooted at a
 * `resolveChain` into the decofile) and returns HTML. Unsigned, a caller picks
 * any block with `__resolveType` (at the root or nested in props) and hands it
 * any props, so every block's loader runs with input nobody on the server
 * chose.
 *
 * Every legitimate URL is built on the server by `useSection`, so it signs what
 * it built and the route refuses anything else. Only the parameters that pick
 * the block and its props are signed: `href`, `renderSalt`, `partialMode` and
 * `__cb` are left free, as clients and caches rewrite them.
 *
 * Key: derived from the site's `DECO_CRYPTO_KEY` (never used as is), or from
 * `DECO_RENDER_SIGNING_KEY` when set, to rotate signing on its own. Without
 * either, the key is random per process, which does not survive across pods,
 * so the default mode drops to `report`.
 *
 * Mode (`DECO_RENDER_SIGNATURE`):
 * - `enforce`: unsigned or tampered requests get a 403. Default with a stable key.
 * - `report`: they are logged and still rendered. Default without a stable key,
 *   and the setting to roll out with while CDN-cached pages still carry
 *   unsigned URLs.
 * - `off`: no check.
 */

export type RenderSignatureMode = "enforce" | "report" | "off";

export type RenderSignatureCheck =
  | { ok: true }
  | { ok: false; reason: "missing" | "invalid" };

export interface RenderSigner {
  readonly mode: RenderSignatureMode;
  /** Whether the key is shared across processes (comes from the environment). */
  readonly stableKey: boolean;
  sign(input: RenderSignatureInput): string;
  verify(
    input: RenderSignatureInput,
    signature: string | null,
  ): RenderSignatureCheck;
}

const CRYPTO_KEY_ENV = "DECO_CRYPTO_KEY";
// Optional: rotates render signing without touching DECO_CRYPTO_KEY.
const SIGNING_KEY_ENV = "DECO_RENDER_SIGNING_KEY";
const MODE_ENV = "DECO_RENDER_SIGNATURE";
// Domain separation: the signing key never equals DECO_CRYPTO_KEY itself.
const KEY_INFO = "deco:render-signature:v1";

const MODES: ReadonlySet<string> = new Set(["enforce", "report", "off"]);

// Length-prefixed so no value can shift into its neighbour's field.
const canonical = (
  { props, resolveChain, pathTemplate }: RenderSignatureInput,
) =>
  ["v1", pathTemplate, props, resolveChain ?? ""]
    .map((value) => `${value.length}:${value}`)
    .join("|");

export const createRenderSigner = (
  { secret, mode }: { secret?: string; mode?: string } = {},
): RenderSigner => {
  const stableKey = typeof secret === "string" && secret.length > 0;
  const key = stableKey
    ? createHmac("sha256", secret).update(KEY_INFO).digest()
    : crypto.getRandomValues(new Uint8Array(32));
  const resolvedMode: RenderSignatureMode = mode && MODES.has(mode)
    ? mode as RenderSignatureMode
    : stableKey
    ? "enforce"
    : "report";

  const sign = (input: RenderSignatureInput) =>
    createHmac("sha256", key).update(canonical(input)).digest("base64url");

  return {
    mode: resolvedMode,
    stableKey,
    sign,
    verify: (input, signature) => {
      if (!signature) return { ok: false, reason: "missing" };
      const expected = new TextEncoder().encode(sign(input));
      const actual = new TextEncoder().encode(signature);
      if (
        expected.length !== actual.length || !timingSafeEqual(expected, actual)
      ) {
        return { ok: false, reason: "invalid" };
      }
      return { ok: true };
    },
  };
};

let signer: RenderSigner | undefined;

/** The process-wide signer, configured from the environment on first use. */
export const renderSigner = (): RenderSigner => {
  if (signer) return signer;
  signer = createRenderSigner({
    secret: Deno.env.get(SIGNING_KEY_ENV) || Deno.env.get(CRYPTO_KEY_ENV),
    mode: Deno.env.get(MODE_ENV),
  });
  if (!signer.stableKey && signer.mode !== "off") {
    logger.warn(
      `/deco/render signatures use a per-process key (set ${CRYPTO_KEY_ENV}); mode: ${signer.mode}`,
    );
  }
  return signer;
};
