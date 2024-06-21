import type { JwtVerifier } from "../../commons/jwt/jwt.ts";
import { getTrustedVerifierOf } from "../../commons/jwt/trusted.ts";

let adminVerifier: Promise<JwtVerifier | undefined> | null = null;
export const getVerifiedJWT = async (req: Request) => {
  adminVerifier ??= getTrustedVerifierOf("https://admin.deco.cx");
  const verifier = await adminVerifier;
  if (!verifier) {
    return undefined;
  }
  const url = new URL(req.url);
  const tokenFromUrl = url.searchParams.get("token");
  const credentials = req.headers.get("authorization") ??
    (tokenFromUrl !== null ? `Bearer ${tokenFromUrl}` : undefined);
  if (!credentials) {
    return undefined;
  }
  const parts = credentials.split(/\s+/);

  if (parts.length !== 2) {
    return undefined;
  }
  return verifier.verify(parts[1]).then((token) => {
    return token;
  }).catch(() => {
    return undefined;
  });
};
