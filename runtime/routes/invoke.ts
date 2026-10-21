import { formDataToProps } from "../../clients/formdata.ts";
import { isAdminOrLocalhost } from "../../utils/admin.ts";
import { allowCorsFor, bodyFromUrl } from "../../utils/http.ts";
import { invokeToHttpResponse } from "../../utils/invoke.ts";
import type { InvokeFunction } from "../../utils/invoke.types.ts";
import { createHandler } from "../middleware.ts";
/**
 * All props parsing strategies supported by the invoke endpoint.
 * To infer a valid strategy for a request, the `getParsingStrategy` function is used.
 */
export const propsParsers = {
  "json": async (req: Request) => await req.json() as Record<string, unknown>,
  "try-json": async (req: Request) => {
    try {
      return await req.json() as Record<string, unknown>;
    } catch (err) {
      console.warn("Error parsing props from request", err);
      return {};
    }
  },
  "form-data": async (req: Request) => {
    const formData = await req.formData();
    return formDataToProps(formData);
  },
  "search-params": (req: Request) => {
    const url = new URL(req.url);
    return bodyFromUrl("props", url);
  },
};

/**
 * Gets the `propsParsers` strategy from the given request.
 */
function getParsingStrategy(req: Request): keyof typeof propsParsers | null {
  if (req.method !== "POST") {
    return "search-params";
  }

  const contentType = req.headers.get("content-type");
  const contentLength = req.headers.get("content-length");

  if (contentLength === "0") {
    return null;
  }

  if (contentType?.startsWith("multipart/form-data")) {
    return "form-data";
  }

  if (!contentLength || !contentType) {
    return "try-json";
  }

  if (contentType.startsWith("application/json")) {
    return "json";
  }

  return null;
}

/**
 * Infers a props parsing strategy from the given request
 * then parses the props from the request.
 * If no strategy is found, an empty object is returned.
 */
async function parsePropsFromRequest(
  req: Request,
): Promise<Record<string, unknown>> {
  const strategy = getParsingStrategy(req);

  if (!strategy) {
    return {};
  }

  return await propsParsers[strategy](req);
}
/**
 * A CORS preflight, as opposed to any other `OPTIONS`. Worth distinguishing:
 * this route is mounted with `hono.all`, so without the check below an
 * `OPTIONS` probe falls through and RUNS the loader just to answer it.
 */
const isPreflight = (req: Request): boolean =>
  req.method === "OPTIONS" && req.headers.has("access-control-request-method");

export const handler = createHandler(async (
  ctx,
): Promise<Response> => {
  // The CMS invokes `@options` loaders straight from the browser, and a JSON
  // body makes that a preflighted cross-origin request. `batchInvoke` (the
  // sibling `/deco/invoke` route, no key) already allows the admin surfaces;
  // single invoke allowed none, so every such call died at the preflight.
  const cors = isAdminOrLocalhost(ctx.req.raw)
    ? allowCorsFor(ctx.req.raw)
    : null;

  if (isPreflight(ctx.req.raw)) {
    return new Response(null, { status: 204, headers: cors ?? {} });
  }

  const key = ctx.var.url.pathname.replace("/live/invoke/", "")
    .replace(
      "/deco/invoke/",
      "",
    );

  const props = await parsePropsFromRequest(ctx.req.raw);

  const select = (ctx.var.url.searchParams.getAll("select") ??
    []) as InvokeFunction[
      "select"
    ];

  const resp = await ctx.var.deco.invoke(
    key as InvokeFunction["key"],
    props as Required<InvokeFunction>["props"],
    select,
    ctx.var,
  );

  const response = invokeToHttpResponse(ctx.req.raw, resp);

  if (cors) {
    for (const [name, value] of Object.entries(cors)) {
      response.headers.set(name, value);
    }
  }

  return response;
});
