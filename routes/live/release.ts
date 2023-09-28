import { HandlerContext } from "$fresh/server.ts";
import { DecoState } from "../../mod.ts";
import { crypto } from "https://deno.land/std@0.201.0/crypto/crypto.ts";
import { decode } from "https://deno.land/std@0.190.0/encoding/base64.ts";

type Signature = string;

interface Payload {
  site: string,
  signature: Signature,
}

const algorithm: RsaHashedKeyGenParams = {
  name: "RSA-PSS",
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: "SHA-256",
};

const verifyAlg: RsaPssParams = {
  name: "RSA-PSS",
  saltLength: 32,
}

const encoder = new TextEncoder();

const getAdminPublicKey = async (): Promise<CryptoKey> => {
  const format = "jwk";
  const json = Deno.env.get("ADMIN_RELEASE_JWK_PUBLIC_KEY");
  const jwk = JSON.parse(json ?? "");
  return await crypto.subtle.importKey(format, jwk, algorithm, true, ['verify']);
}

const verifySignature = async (payload: Payload): Promise<boolean> => {
  const data = encoder.encode(payload.site);
  const key = await getAdminPublicKey();
  const signature = decode(payload.signature);
  return crypto.subtle.verify(verifyAlg, key, signature, data);
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
    try {
      const payload: Payload = await _req.json();
      const verified = await verifySignature(payload);
      if (!verified) {
        return new Response(null, {
          status: 401,
        })
      }
      const channel = new BroadcastChannel(payload.site)
      channel.postMessage({});
      return new Response(null, {
        status: 200,
      });
    } catch {
      return new Response(null, {
        status: 500,
      }) 
    }
  } else {
    return new Response(null, {
      status: 405,
    })
  }
};
