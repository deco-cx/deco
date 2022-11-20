import {
  blue,
  cyan,
  green,
  red,
  yellow,
} from "https://deno.land/std@0.147.0/fmt/colors.ts";
import { context } from "$live/live.ts";

const DEPLOY = Boolean(context.deploymentId);

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

  if (DEPLOY) {
    return `[${
      statusFormatter(`${opts.status}`)
    }]: ${duration}ms ${opts.url.pathname} ${opts.pageId ? opts.pageId : ""}`;
  }

  return `[${statusFormatter(`${opts.status}`)}]: ${duration}ms ${
    cyan(opts.url.pathname)
  } ${green(`https://deco.cx/live/${context.siteId}/pages/${opts.pageId}`)}`;
};
