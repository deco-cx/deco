export const sha1 = async (text: string) => {
  const buffer = await crypto.subtle
    .digest("SHA-1", new TextEncoder().encode(text));

  const hex = Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return hex;
};