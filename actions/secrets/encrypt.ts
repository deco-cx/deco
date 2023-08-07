import { encode as he } from "https://deno.land/std@0.190.0/encoding/hex.ts";
import { getOrGenerateKey, td, te } from "./__key__.ts";

export interface Props {
  value: string;
}

export interface SignedMessage {
  value: string;
}

export default async function Encrypt(
  { value }: Props,
): Promise<SignedMessage> {
  const { key, iv } = await getOrGenerateKey();

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-CBC", iv },
    key,
    te(value),
  );
  const encryptedBytes = new Uint8Array(encrypted);
  const hexBytes = td(he(encryptedBytes));
  return { value: hexBytes };
}
