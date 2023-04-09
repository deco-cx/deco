import { HandlerContext } from "$fresh/server.ts";
import { IS_BROWSER } from "https://deno.land/x/fresh@1.1.4/runtime.ts";

export const funcs: Record<string, (...args: any[]) => Promise<any>> = {};

export const server$ = <T>(f: (...args: any[]) => Promise<T>) => {
  if (IS_BROWSER) {
    return async (...args: any[]): Promise<T> => {
      return await fetch(`/live/rpc/my-func`, {
        method: "POST",
        body: JSON.stringify({ params: args }),
      }).then((resp) => resp.json().then((d) => d.data));
    };
  }
  funcs["my-func"] = f;
  return f;
};

export const handler = async (req: Request, ctx: HandlerContext) => {
  const body = await req.json();
  const f = funcs[ctx.params.func];
  return Response.json(
    { data: await f(...body.params) },
  );
};
