import { getOrGenerateKey } from "$live/actions/secrets/__key__.ts";
import { shortcircuit } from "$live/engine/errors.ts";
import { BlockInvocation } from "$live/engine/fresh/defaults.ts";
import { decode as hd } from "https://deno.land/std@0.190.0/encoding/hex.ts";
import { td, te } from "./__key__.ts";

export interface Props {
  encrypted: string;
}

export interface DecryptedMessage {
  decrypted: string;
}

export const invoke = ({ props, source }: BlockInvocation<Props>) => {
  if (source === "external") {
    shortcircuit(new Response(null, { status: 403 }));
    return null;
  }
  return Decrypt(props);
};

export default async function Decrypt(
  { encrypted }: Props,
): Promise<DecryptedMessage> {
  const { key, iv } = await getOrGenerateKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-CBC", iv },
    key,
    hd(te(encrypted)),
  );
  const decryptedBytes = new Uint8Array(decrypted);
  return { decrypted: td(decryptedBytes) };
}
