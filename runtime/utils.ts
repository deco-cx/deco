import type { RequestState } from "../blocks/utils.tsx";
import { vary } from "../utils/vary.ts";
import { Context } from "../deco.ts";
import { defaultHeaders } from "../utils/http.ts";

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
