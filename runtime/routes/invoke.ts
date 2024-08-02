import { bodyFromUrl } from "../../utils/http.ts";
import { invokeToHttpResponse } from "../../utils/invoke.ts";
import type { InvokeFunction } from "../../utils/invoke.types.ts";
import { createHandler } from "../middleware.ts";

export const handler = createHandler(async (
  ctx,
): Promise<Response> => {
  const key = ctx.var.url.pathname.replace("/live/invoke/", "")
    .replace(
      "/deco/invoke/",
      "",
    );
  const props = ctx.req.raw.method === "POST"
    ? ctx.req.raw.headers.get("content-length") === "0"
      ? {}
      : await ctx.req.raw.json()
    : bodyFromUrl("props", ctx.var.url);

  const select = (ctx.var.url.searchParams.getAll("select") ??
    []) as InvokeFunction[
      "select"
    ];

  const resp = await ctx.var.deco.invoke(
    key as InvokeFunction["key"],
    props as InvokeFunction["props"],
    select,
    ctx.var,
  );

  return invokeToHttpResponse(ctx.req.raw, resp);
});
