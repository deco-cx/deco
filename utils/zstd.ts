import {
  compress,
  decompress,
  init,
} from "https://deno.land/x/zstd_wasm@0.0.20/deno/zstd.ts";

await init();

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const compressFromJSON = <T>(data: T): Uint8Array => {
  const stringifiedData = JSON.stringify(data);
  const buffer = encoder.encode(stringifiedData);
  return compress(buffer, 10);
};

export const decompressToJSON = <T>(data: Uint8Array): T => {
  const str = decoder.decode(decompress(data));
  return data ? JSON.parse(str) : data;
};
