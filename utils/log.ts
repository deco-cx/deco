import { blue, bold, cyan, gray, green, red, yellow } from "std/fmt/colors.ts";
import { context } from "../live.ts";

export const formatHeaders = (h: Headers) => {
  const headersAsObject: Record<string, string> = {};
  for (const [key, value] of h.entries()) {
    headersAsObject[key] = value;
  }

  return `${cyan(bold("Incoming Headers:"))} ${
    JSON.stringify(headersAsObject)
  }\n`;
};

export const formatIncomingRequest = (request: Request, site: string) => {
  return `${cyan(bold("Site: "))}${site} - ${
    cyan(bold("URL:"))
  } ${request.url}\n${formatHeaders(request.headers)}`;
};

export const formatOutgoingFetch = (
  request: Request,
  response: Response,
  duration: number,
) => {
  const xcache = response.headers.get("x-cache") ?? "BYPASS";
  const durationColor = duration < 300 ? green : duration < 700 ? yellow : red;
  const durationStr = duration > 1e3
    ? `${(duration / 1e3).toFixed(2)}s`
    : `${duration.toFixed(0)}ms`;

  return ` -> ${xcache.padEnd(6)} ${durationColor(durationStr)} ${
    bold(request.method)
  } | ${gray(request.url)}`;
};

export const formatLog = (opts: {
  status: number;
  begin: number;
  url: URL;
  pageId?: number;
}) => {
  const statusFormatter = opts.status < 300
    ? green
    : opts.status < 400
    ? blue
    : opts.status < 500
    ? yellow
    : red;
  const duration = (performance.now() - opts.begin).toFixed(0);

  if (context.isDeploy) {
    return `[${
      statusFormatter(`${opts.status}`)
    }]: ${duration}ms ${opts.url.pathname} ${opts.pageId ? opts.pageId : ""}`;
  }

  return `[${statusFormatter(`${opts.status}`)}]: ${duration}ms ${
    cyan(opts.url.pathname)
  } ${
    opts.pageId
      ? green(`https://deco.cx/live/${context.siteId}/pages/${opts.pageId}`)
      : ""
  }`;
};
