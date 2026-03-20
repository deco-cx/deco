// deno-lint-ignore-file no-explicit-any
import type { StatusCode as Status } from "@std/http/status";
import type { AppManifest } from "../blocks/app.ts";
import type { HttpContext } from "../blocks/handler.ts";
import type { InvocationFunc } from "../clients/withManifest.ts";
import { getCookies, Murmurhash3, setCookie } from "../deps.ts";
import type { Block, BlockModule, InstanceOf } from "../engine/block.ts";
import type { ResolveFunc } from "../engine/core/resolver.ts";
import type { PromiseOrValue } from "../engine/core/utils.ts";
import type { Device } from "../utils/userAgent.ts";
import type { InvocationProxy } from "../utils/invoke.types.ts";
import { fnContextFromHttpContext, type RequestState } from "./utils.tsx";

export type Matcher = InstanceOf<typeof matcherBlock, "#/root/matchers">;

// deno-lint-ignore ban-types
export type MatchContext<T = {}> = T & {
  device: Device;
  siteId: number;
  request: Request;
  resolve: ResolveFunc;
  invoke: InvocationProxy<AppManifest> & InvocationFunc<AppManifest>;
  response: { headers: Headers; status?: Status };
  bag: WeakMap<any, any>;
};

// Murmurhash3 is used for hashing matcher unique IDs into cookie names.

export const DECO_MATCHER_PREFIX = `deco_matcher_`;
export const DECO_MATCHER_HEADER_QS = "x-deco-matchers";
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

type MatchFunc<TConfig = any> =
  | ((config: TConfig) => (ctx: MatchContext) => PromiseOrValue<boolean>)
  | ((config: TConfig) => PromiseOrValue<boolean>)
  | ((config: TConfig, ctx: MatchContext) => PromiseOrValue<boolean>);

export type MatcherStickiness = "session" | "none";

export type MatcherModule<TProps = any> =
  | MatcherStickySessionModule<TProps>
  | MatcherStickyNoneModule;

const isStickySessionModule = <TProps = any>(
  matcher: MatcherModule<TProps>,
): matcher is MatcherStickySessionModule<TProps> => {
  return (matcher as MatcherStickySessionModule<TProps>).sticky === "session";
};

export type BlockModuleMatcher =
  & BlockModule<
    MatchFunc,
    | PromiseOrValue<boolean>
    | ((ctx: MatchContext) => PromiseOrValue<boolean>),
    (ctx: MatchContext) => PromiseOrValue<boolean>
  >
  & {
    cacheable?: boolean;
  };

export interface MatcherStickyNoneModule extends BlockModuleMatcher {
  sticky?: "none";
}

export interface MatcherStickySessionModule<TProps = any>
  extends BlockModuleMatcher {
  sticky: "session";
  sessionKey?: (
    props: TProps,
    ctx: MatchContext,
  ) => string | null;
}

const charByType = {
  "resolvable": "@",
  "prop": ".",
};
const matcherBlock: Block<
  BlockModule<
    MatchFunc,
    | PromiseOrValue<boolean>
    | ((ctx: MatchContext) => PromiseOrValue<boolean>),
    (ctx: MatchContext) => PromiseOrValue<boolean>
  >
> = {
  type: "matchers",
  adapt: <TConfig = unknown>(
    matcherModule: MatcherModule<TConfig>,
  ) =>
  (
    $live: TConfig,
    httpCtx: HttpContext<
      {
        global: unknown;
      } & RequestState,
      unknown
    >,
  ) => {
    const { default: func } = matcherModule;
    const matcherFunc = async (ctx: MatchContext): Promise<boolean> => {
      const fMatcher = func as unknown as
        | ((c: TConfig, ctx: MatchContext) => PromiseOrValue<boolean>)
        | MatchFunc;
      const matcherFuncOrValue = await fMatcher($live, ctx);
      if (typeof matcherFuncOrValue === "function") {
        return await matcherFuncOrValue(ctx);
      }
      return matcherFuncOrValue;
    };
    const respHeaders = httpCtx.context.state.response.headers;
    const shouldStickyOnSession = isStickySessionModule(matcherModule);
    const fnCtx = fnContextFromHttpContext(httpCtx);
    return async (ctx: MatchContext): Promise<boolean> => {
      let uniqueId = "";
      let isSegment = true;

      // from last to first and stop in the first resolvable
      // the rationale behind is: whenever you enter a resolvable it means that it can be referenced by other resolvables and this value should not change.
      for (let i = httpCtx.resolveChain.length - 1; i >= 0; i--) {
        const { type, value } = httpCtx.resolveChain[i];
        if (type === "prop" || type === "resolvable") {
          uniqueId =
            (`${value}${uniqueId.length > 0 ? charByType[type] : ""}`) +
            uniqueId;
        }
        // stop on first resolvable
        if (type === "resolvable") {
          isSegment = uniqueId === value;
          break;
        }
      }
      const enrichedCtx: MatchContext = {
        ...ctx,
        resolve: fnCtx.get,
        invoke: fnCtx.invoke,
        response: fnCtx.response,
        bag: fnCtx.bag,
      };
      const { [uniqueId]: isEnabled } = matchersOverride.parse(
        enrichedCtx.request,
      );

      let result = isEnabled;
      // if it is not sticky then we can run the matcher function
      if (!shouldStickyOnSession) {
        result ??= await matcherFunc(enrichedCtx);
      } else {
        const h = new Murmurhash3();
        h.hash(uniqueId);
        const _sessionKey = matcherModule.sessionKey
          ? `_${matcherModule.sessionKey?.($live, enrichedCtx)}`
          : "";
        const cookieName = `${DECO_MATCHER_PREFIX}${h.result()}${_sessionKey}`;
        const isMatchFromCookie = cookieValue.boolean(
          getCookies(enrichedCtx.request.headers)[cookieName],
        );
        result ??= isMatchFromCookie ?? await matcherFunc(enrichedCtx);
        if (result !== isMatchFromCookie) {
          const date = new Date();
          date.setTime(date.getTime() + (30 * 24 * 60 * 60 * 1000)); // 1 month
          setCookie(respHeaders, {
            name: cookieName,
            value: cookieValue.build(uniqueId, result),
            path: "/",
            sameSite: "Lax",
            expires: date,
          });
          respHeaders.append("vary", "cookie");
        }
      }

      httpCtx.context.state.flags.push({
        name: uniqueId,
        value: result,
        isSegment,
        cacheable: matcherModule.cacheable,
      });

      return result;
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
