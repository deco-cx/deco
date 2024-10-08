import type { RequestState } from "../blocks/utils.tsx";
import { vary } from "../utils/vary.ts";
import { Context } from "../deco.ts";
import { defaultHeaders } from "../utils/http.ts";

export const sha1 = async (text: string) => {
  const buffer = await crypto.subtle
    .digest("SHA-1", new TextEncoder().encode(text));

  const hex = Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return hex;
};

export function numToUint8Array(num: number) {
  const arr = new Uint8Array(8);
  for (let i = 0; i < 8; i++) {
    arr[i] = num % 256;
    num = Math.floor(num / 256);
  }
  return arr;
}

export function uint8ArrayToNum(arr: Uint8Array) {
  let num = 0;
  for (let i = 0; i < 8; i++) {
    num += Math.pow(256, i) * arr[i];
  }
  return num;
}

export function baseState() {
  const context = Context.active();

  const response = {
    headers: new Headers(defaultHeaders),
    status: undefined,
  };
  const state = {} as RequestState;
  state.response = response;
  state.bag = new WeakMap();
  state.vary = vary();
  state.flags = [];

  return {
    ...state,
    site: {
      name: context.site,
    },
  } as RequestState;
}
