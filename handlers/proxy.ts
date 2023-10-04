import { getSetCookies, Handler, setCookie } from "std/http/mod.ts";
import { isFreshCtx } from "../handlers/fresh.ts";
import { DecoSiteState } from "../mod.ts";

const HOP_BY_HOP = [
  "Keep-Alive",
  "Transfer-Encoding",
  "TE",
  "Connection",
  "Trailer",
  "Upgrade",
  "Proxy-Authorization",
  "Proxy-Authenticate",
];

const noTrailingSlashes = (str: string) =>
  str.at(-1) === "/" ? str.slice(0, -1) : str;
const sanitize = (str: string) => str.startsWith("/") ? str : `/${str}`;
const removeCFHeaders = (headers: Headers) => {
  headers.forEach((_value, key) => {
    if (key.startsWith("cf-")) {
      headers.delete(key);
    }
  });
};

const proxyTo = (
  { proxyUrl: rawProxyUrl, basePath, host: hostToUse, customHeaders = {} }: {
    proxyUrl: string;
    basePath?: string;
    host?: string;
    customHeaders?: Record<string, string>;
  },
): Handler =>
async (req, _ctx) => {
  const url = new URL(req.url);
  const proxyUrl = noTrailingSlashes(rawProxyUrl);
  const qs = url.searchParams.toString();
  const path = basePath && basePath.length > 0
    ? url.pathname.replace(basePath, "")
    : url.pathname;

  const to = new URL(
    `${proxyUrl}${sanitize(path)}?${qs}`,
  );

  const headers = new Headers(req.headers);
  HOP_BY_HOP.forEach((h) => headers.delete(h));

  if (isFreshCtx<DecoSiteState>(_ctx)) {
    _ctx?.state?.monitoring?.logger?.log?.("proxy received headers", headers);
  }
  removeCFHeaders(headers); // cf-headers are not ASCII-compliant
  if (isFreshCtx<DecoSiteState>(_ctx)) {
    _ctx?.state?.monitoring?.logger?.log?.("proxy sent headers", headers);
  }

  headers.set("origin", req.headers.get("origin") ?? url.origin);
  headers.set("host", hostToUse ?? to.host);
  headers.set("x-forwarded-host", url.host);

  for (const [key, value] of Object.entries(customHeaders ?? {})) {
    headers.set(key, value);
  }

  const response = await fetch(to, {
    headers,
    redirect: "manual",
    method: req.method,
    body: req.body,
  });

  // Change cookies domain
  const responseHeaders = new Headers(response.headers);
  const cookies = getSetCookies(responseHeaders);
  responseHeaders.delete("set-cookie");

  // Setting cookies on GET requests prevent cache from cdns, slowing down the app
  for (const cookie of cookies) {
    setCookie(responseHeaders, { ...cookie, domain: url.hostname });
  }
  if (response.status >= 300 && response.status < 400) { // redirect change location header
    const location = responseHeaders.get("location");
    if (location) {
      responseHeaders.set(
        "location",
        location.replace(proxyUrl, url.origin),
      );
    }
  }

  return new Response(response.body, {
    status: response.status,
    headers: responseHeaders,
  });
};

/**
 * @title {{{key}}} - {{{value}}}
 */
export interface Header {
  /**
   * @title Key
   */
  key: string;
  /**
   * @title Value
   */
  value: string;
}

export interface Props {
  /**
   * @description the proxy url.
   * @example https://bravtexfashionstore.vtexcommercestable.com.br/api
   */
  url: string;
  /**
   * @description the base path of the url.
   * @example /api
   */
  basePath?: string;

  /**
   * @description Host that should be used when proxying the request
   */
  host?: string;
  /**
   * @description custom headers
   */
  customHeaders?: Header[];
}

/**
 * @title Proxy Handler
 * @description Proxies request to the target url.
 */
export default function Proxy({ url, basePath, host }: Props) {
  return proxyTo({ proxyUrl: url, basePath, host });
}
