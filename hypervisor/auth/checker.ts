import type { JwtVerifier } from "deco/deps.ts";
import { getTrustedVerifierOf } from "../../commons/jwt/trusted.ts";

let adminVerifier: Promise<JwtVerifier | undefined> | null = null;
export const isAuthenticated = async (req: Request) => {
  adminVerifier ??= getTrustedVerifierOf("https://admin.deco.cx");
  const verifier = await adminVerifier;
  if (!verifier) {
    return false;
  }
  const credentials = req.headers.get("authorization");
  if (!credentials) {
    return false;
  }
  const parts = credentials.split(/\s+/);

  if (parts.length !== 2) {
    return false;
  }
  return verifier.verify(parts[1]).then(() => {
    return true;
  }).catch(() => {
    return false;
  });
};
