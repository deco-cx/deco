import { type JwtVerifier, newJwtVerifierWithJWK } from "./jwt.ts";

const ADMIN_PUBLIC_KEY = Deno.env.get("DECO_ADMIN_PUBLIC_KEY") ??
  "eyJrdHkiOiJSU0EiLCJhbGciOiJSUzI1NiIsIm4iOiJ1N0Y3UklDN19Zc3ljTFhEYlBvQ1pUQnM2elZ6VjVPWkhXQ0M4akFZeFdPUnByem9WNDJDQ1JBVkVOVjJldzk1MnJOX2FTMmR3WDlmVGRvdk9zWl9jX2RVRXctdGlPN3hJLXd0YkxsanNUbUhoNFpiYXU0aUVoa0o1VGNHc2VaelhFYXNOSEhHdUo4SzY3WHluRHJSX0h4Ym9kQ2YxNFFJTmc5QnJjT3FNQmQyMUl4eUctVVhQampBTnRDTlNici1rXzFKeTZxNmtPeVJ1ZmV2Mjl0djA4Ykh5WDJQenp5Tnp3RWpjY0lROWpmSFdMN0JXX2tzdFpOOXU3TUtSLWJ4bjlSM0FKMEpZTHdXR3VnZGpNdVpBRnk0dm5BUXZzTk5Cd3p2YnFzMnZNd0dDTnF1ZE1tVmFudlNzQTJKYkE3Q0JoazI5TkRFTXRtUS1wbmo1cUlYSlEiLCJlIjoiQVFBQiIsImtleV9vcHMiOlsidmVyaWZ5Il0sImV4dCI6dHJ1ZX0";
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
