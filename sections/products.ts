import { LoaderReturn as LReturn } from "$live/blocks/loader.ts";
import { LiveState } from "$live/engine/adapters/fresh/manifest.ts";
import { HandlerContext } from "https://deno.land/x/fresh@1.1.2/server.ts";
import { VTEXAccount } from "../accounts/vtexAccount.ts";

export interface Product {
  price: number;
}
export function MyLoader(
  _: Request,
  __: HandlerContext<any, LiveState<unknown>>
): LReturn<Product[]> {
  return [];
}

export function MyLoader2(): VTEXAccount {
  return {} as VTEXAccount;
}

export const f = (): VTEXAccount => {
  return {} as VTEXAccount;
};
