import { tokenIsValid } from "../commons/jwt/engine.ts";
import type { JwtVerifier } from "../commons/jwt/jwt.ts";
import { getTrustedVerifierOf } from "../commons/jwt/trusted.ts";
import type { Hono } from "./deps.ts";

const BYPASS_JWT_VERIFICATION =
  Deno.env.get("DANGEROUSLY_ALLOW_PUBLIC_ACCESS") === "true";

let adminVerifier: Promise<JwtVerifier | undefined> | null = null;

const getVerifiedJWT = async (req: Request) => {
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

interface Options {
  site: string;
}

export const createAuth = ({ site }: Options): Hono.MiddlewareHandler => {
  return async (c, next) => {
    if (!BYPASS_JWT_VERIFICATION) {
      const jwt = await getVerifiedJWT(c.req.raw);
      if (!jwt) {
        return new Response(null, { status: 401 });
      }
      if (site && !tokenIsValid(site, jwt)) {
        return new Response(null, { status: 403 });
      }
    }
    await next();
  };
};
