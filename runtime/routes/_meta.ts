import { allowCorsFor } from "../../utils/http.ts";
import { createHandler } from "../middleware.ts";

export const handler = createHandler(async (ctx) => {
  const ifNoneMatch = ctx.req.raw.headers.get("if-none-match");

  const res = await ctx.var.deco.meta(
    ifNoneMatch && ctx.var.url.searchParams.get("waitForChanges") === "true"
      ? {
        ifNoneMatch,
        signal: ctx.req.raw.signal,
      }
      : undefined,
  );
  if (!res) {
    return new Response(null, {
      status: 408,
      headers: allowCorsFor(ctx.req.raw),
    });
  }

  const { value, etag } = res;

  return new Response(JSON.stringify(value), {
    headers: {
      "Content-Type": "application/json",
      "cache-control": "must-revalidate",
      etag,
      ...allowCorsFor(ctx.req.raw),
    },
  });
});
