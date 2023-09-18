import { HandlerContext } from "$fresh/server.ts";
import { DecoState } from "../../mod.ts";
import { crypto } from "https://deno.land/std@0.201.0/crypto/crypto.ts";

interface Signature {
  site: string,
  signature: ArrayBuffer
}

const algorithm: RsaHashedKeyGenParams = {
  name: "RSA-PSS",
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: "SHA-256",
};

const encoder = new TextEncoder();

const getAdminPublicKey = async (): Promise<CryptoKey> => {
  const format = "jwk";
  const json = Deno.env.get("ADMIN_RELEASE_JWK_PUBLIC_KEY");
  const jwk = JSON.parse(json ?? "");
  return await crypto.subtle.importKey(format, jwk, algorithm, true, ['verify']);
}

const verifySignature = async (signature: Signature): Promise<boolean> => {
  const data = encoder.encode(signature.site);
  const key = await getAdminPublicKey();
  return crypto.subtle.verify(algorithm, key, signature.signature, data);
}

export const handler = async (
  _req: Request,
  ctx: HandlerContext<unknown, DecoState>,
) => {
  if (_req.method === "GET") {
    return new Response(
      JSON.stringify(await ctx.state.release.state()),
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  } else if (_req.method === "POST") {
    const signature: Signature = await _req.json();
    const verified = await verifySignature(signature);
    if (!verified) {
      return new Response(null, {
        status: 401,
      })
    }
    const channel = new BroadcastChannel(signature.site)
    channel.postMessage({});
    return new Response(null, {
      status: 200,
    });
  }
};
