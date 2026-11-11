import { type JwtVerifier, newJwtVerifierWithJWK } from "./jwt.ts";

// Public key admin.deco.cx signs daemon tokens with (rotated 2026-11; tokens
// signed with the previous key are rejected).
// DECO_ADMIN_PUBLIC_KEY (base64 JWK) overrides it, so the next rotation can be
// rolled out through env instead of a release.
const ADMIN_PUBLIC_KEY = Deno.env.get("DECO_ADMIN_PUBLIC_KEY") ??
  "eyJrdHkiOiJSU0EiLCJhbGciOiJSUzI1NiIsIm4iOiI0OWVyQ2hyRDRJS3ZDZlNRX2t4UzJJX3c5Yzh5SFluYWYtS1BEajk4akNJeWh3YWtVQjUtSlhZTGFTbmMxTDA1RFBsUTJacjMyclltb1RSMVlsMHFodWtGU2c3U0JDTzdScDhvSkdhNjAxcXhwdVNVb2ZzMVBtMXR6ZTZ0bUxZcUE2NlFmcDM3NmZhZE9rNTJMRTVRdVhVanBXTThmeVNkQWppa3lHMDdOTXB3SWRzLTlTQ2hfbzdpanZjbXp2T0QxZ1d0a211WjRxZHlvSV9PNUtHWjFPWFdhMThUYWxCd0VRTlEtQl9VaUFEZzNfTEhkRG9wenNOWVAwcHpaQ0UtTWhBdGVTTFpVMVgydFQ3azF6cXBYWFR6eEIxYUFnT2hISTFSLUJCSThjaGZuS2YwekQ4VVVabHFjNEVCci1RV3ZWcFlRWnNUd3dtTnRoRjc1Y1RidnciLCJlIjoiQVFBQiIsImtleV9vcHMiOlsidmVyaWZ5Il0sImV4dCI6dHJ1ZX0=";
export const trustedIssuers = {
  "https://admin.deco.cx": {
    publicKey: ADMIN_PUBLIC_KEY,
  },
};

const verifiers = new Map<string, Promise<JwtVerifier>>();

/**
 * Returns and initializes a verifier based on the given issuer.
 */
export const getTrustedVerifierOf = (
  issuer: keyof typeof trustedIssuers,
): Promise<JwtVerifier | undefined> => {
  const publicKey = trustedIssuers[issuer]?.publicKey;
  if (!publicKey) {
    return Promise.resolve(undefined);
  }
  let verifier = verifiers.get(issuer);
  if (!verifier) {
    verifier = newJwtVerifierWithJWK(publicKey);
  }
  return verifier;
};
