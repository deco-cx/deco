import { Context } from "deco/deco.ts";
import { defaultHeaders } from "deco/utils/http.ts";
import { RequestState } from "deco/blocks/utils.tsx";

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

export function initializeState(baseState?: Partial<RequestState>) {
  const context = Context.active();

  const response = {
    headers: new Headers(defaultHeaders),
    status: undefined,
  };
  const state = baseState ?? {};
  state.response = response;
  state.bag = new WeakMap();
  state.flags = [];

  return {
    ...state,
    site: {
      id: context.siteId,
      name: context.site,
    },
  } as RequestState;
}
