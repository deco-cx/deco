import { getOrGenerateKey, td, te } from "$live/commons/secrets/keys.ts";
import { ActionContext } from "$live/types.ts";
import { allowCorsFor } from "$live/utils/http.ts";
import { encode as he } from "std/encoding/hex.ts";

export interface Props {
  value: string;
}

export interface SignedMessage {
  value: string;
}

export default async function Encrypt(
  { value }: Props,
  req: Request,
  ctx: ActionContext,
): Promise<SignedMessage> {
  try {
    Object.entries(allowCorsFor(req)).map(([name, value]) => {
      ctx.response.headers.set(name, value);
    });
    const { key, iv } = await getOrGenerateKey();

    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-CBC", iv },
      key,
      te(value),
    );
    const encryptedBytes = new Uint8Array(encrypted);
    const hexBytes = td(he(encryptedBytes));
    return { value: hexBytes };
  } catch (err) {
    console.log(err);
    throw err;
  }
}
