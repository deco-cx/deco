import {
  compress,
  decompress,
  init,
} from "https://deno.land/x/zstd_wasm@0.0.20/deno/zstd.ts";

await init();

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const COMPRESS_LEVEL = 10;

export const compressFromJSON = <T>(
  data: T,
  interceptor?: (str: string) => string,
): Uint8Array => {
  const stringifiedData = JSON.stringify(data);
  const buffer = encoder.encode(
    interceptor ? interceptor(stringifiedData) : stringifiedData,
  );
  return compress(buffer, COMPRESS_LEVEL);
};

export const decompressToJSON = <T>(
  data: Uint8Array,
  intercept?: (str: string) => string,
): T => {
  const str = decoder.decode(decompress(data));
  return data ? JSON.parse(intercept ? intercept(str) : str) : data;
};
