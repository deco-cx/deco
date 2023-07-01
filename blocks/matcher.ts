import { HttpContext } from "$live/blocks/handler.ts";
import { Block, BlockModule, InstanceOf } from "$live/engine/block.ts";
import Murmurhash3 from "https://deno.land/x/murmurhash@v1.0.0/mod.ts";
import { getCookies, setCookie } from "std/http/mod.ts";

export type Matcher = InstanceOf<typeof matcherBlock, "#/root/matchers">;

// deno-lint-ignore ban-types
export type MatchContext<T = {}> = T & {
  siteId: number;
  request: Request;
  isMatchFromCookie?: boolean;
};

// Murmurhash3 was chosen because it is fast
const hasher = new Murmurhash3("string"); // This object cannot be shared across executions when a `await` keyword is used (which is not the case here).

const DECO_MATCHER_HEADER_QS = "x-deco-matchers";
const DECO_MATCHER_HEADER_QS_OVERRIDE = `${DECO_MATCHER_HEADER_QS}-override`;

const matchersOverride = {
  parse: (request: Request): Record<string, boolean> => {
    return matchersOverride.parseFromHeaders(request.headers) ??
      matchersOverride.parseFromQS(request.url) ?? {};
  },
  parseFromQS: (reqUrl: string): Record<string, boolean> | undefined => {
    const url = new URL(reqUrl);
    if (!url.searchParams.has(DECO_MATCHER_HEADER_QS_OVERRIDE)) {
      return undefined;
    }
    const values: Record<string, boolean> = {};
    const vals = url.searchParams.getAll(DECO_MATCHER_HEADER_QS_OVERRIDE);
    for (const val of vals) {
      const [key, value] = val.split("=");
      values[key] = value === "1";
    }
    return values;
  },
  parseFromHeaders: (headers: Headers): Record<string, boolean> | undefined => {
    if (!headers.has(DECO_MATCHER_HEADER_QS_OVERRIDE)) {
      return undefined;
    }
    const val = headers.get(DECO_MATCHER_HEADER_QS_OVERRIDE);
    if (!val) {
      return undefined;
    }
    const values: Record<string, boolean> = {};
    const eachHeader = val.split(" ");

    for (const keyValue of eachHeader) {
      const [key, value] = keyValue.split("=");
      values[key] = value === "1";
    }
    return values;
  },
};
const SEPARATOR = "@";
const cookieValue = {
  build: (id: string, result: boolean) =>
    `${btoa(id)}${SEPARATOR}${result ? 1 : 0}`,
  boolean: (str: string): boolean | undefined => {
    const parts = (str ?? "").split(SEPARATOR);
    if (parts.length < 2) {
      return undefined;
    }
    const [_, result] = parts;
    return result === "1";
  },
};

// deno-lint-ignore no-explicit-any
type MatchFunc<TConfig = any> =
  | ((config: TConfig) => (ctx: MatchContext) => boolean)
  | ((config: TConfig) => boolean)
  | ((config: TConfig, ctx: MatchContext) => boolean);

export interface MatcherModule extends
  BlockModule<
    MatchFunc,
    boolean | ((ctx: MatchContext) => boolean),
    (ctx: MatchContext) => boolean
  > {
  unstable?: boolean;
}
const matcherBlock: Block<
  BlockModule<
    MatchFunc,
    boolean | ((ctx: MatchContext) => boolean),
    (ctx: MatchContext) => boolean
  >
> = {
  type: "matchers",
  introspect: {
    default: "0",
  },
  adapt: <TConfig = unknown>(
    { default: func, unstable }: MatcherModule,
  ) =>
  (
    $live: TConfig,
    httpCtx: HttpContext<
      {
        global: unknown;
        response: { headers: Headers };
      },
      unknown
    >,
  ) => {
    const matcherFunc = (ctx: MatchContext) => {
      const fMatcher = func as unknown as
        | ((c: TConfig, ctx: MatchContext) => boolean)
        | MatchFunc;
      const matcherFuncOrValue = fMatcher($live, ctx);
      if (typeof matcherFuncOrValue === "function") {
        return matcherFuncOrValue(ctx);
      }
      return matcherFuncOrValue;
    };
    const respHeaders = httpCtx.context.state.response.headers;
    const cacheControl = httpCtx.request.headers.get("Cache-Control");
    const isNoCache = cacheControl === "no-cache";
    return (ctx: MatchContext) => {
      try {
        let uniqueId = "";
        // from last to first and stop in the first resolvable
        // the rational behind is: whenever you enter in a resolvable it means that it can be referenced by other resolvables and this value should not change.
        const charByType = {
          "resolvable": "@",
          "prop": ".",
        };
        for (let i = httpCtx.resolveChain.length - 1; i >= 0; i--) {
          const { type, value } = httpCtx.resolveChain[i];
          if (type === "prop" || type === "resolvable") {
            hasher.hash(`${value}`);
            uniqueId =
              (`${value}${uniqueId.length > 0 ? charByType[type] : ""}`) +
              uniqueId;
          }
          // stop on first resolvable
          if (type === "resolvable") {
            break;
          }
        }
        const cookieName = `_dcxf_matchers_${hasher.result()}`;
        const { [uniqueId]: isEnabled } = matchersOverride.parse(
          ctx.request,
        );
        const isMatchFromCookie = isNoCache
          ? undefined
          : cookieValue.boolean(getCookies(ctx.request.headers)[cookieName]);

        const result = isEnabled ?? matcherFunc({ ...ctx, isMatchFromCookie });
        const value = cookieValue.build(uniqueId, result);
        if (result !== isMatchFromCookie && unstable) {
          setCookie(respHeaders, {
            name: cookieName,
            value,
          });
          respHeaders.append("vary", "cookie");
        }
        respHeaders.append(
          DECO_MATCHER_HEADER_QS,
          `${uniqueId}=${result ? 1 : 0}`,
        );
        return result;
      } finally {
        hasher.reset();
      }
    };
  },
};

/**
 * (config:TConfig) => (matchCtx: MatchContext) => boolean
 * (config:TConfig, matchCtx: MatchContext) => boolean
 * (config:TConfig) => boolean
 * Matchers are functions that takes a match context as a parameter and returns a boolean.
 */
export default matcherBlock;
