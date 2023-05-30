import { getSetCookies, Handler, setCookie } from "std/http/mod.ts";

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

const sanitize = (str: string) => str.startsWith("/") ? str : `/${str}`;
const proxyTo =
  (proxyUrl: string, basePath?: string): Handler => async (req, _ctx) => {
    const url = new URL(req.url);
    const qs = url.searchParams.toString();
    const path = basePath && basePath.length > 0
      ? url.pathname.replace(basePath, "")
      : url.pathname;

    const to = new URL(
      `${proxyUrl}${sanitize(path)}?${qs}`,
    );

    const headers = new Headers(req.headers);
    HOP_BY_HOP.forEach((h) => headers.delete(h));
    headers.set("origin", to.origin);
    headers.set("host", to.host);
    headers.set("x-forwarded-host", url.host);

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
}

/**
 * @title Proxy Handler
 * @description Proxies request to the target url.
 */
export default function Proxy({ url, basePath }: Props) {
  return proxyTo(url, basePath);
}
