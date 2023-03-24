import JsonViewer from "$live/blocks/utils.tsx";
import { Block, InstanceOf } from "$live/engine/block.ts";

export type Matcher = InstanceOf<typeof matcherBlock, "#/root/matchers">;

// deno-lint-ignore no-explicit-any
export type MatchContext<T = any> = T & {
  siteId: number;
  request: Request;
};

// deno-lint-ignore no-explicit-any
type MatchFunc<TConfig = any> =
  | ((config: TConfig) => (ctx: MatchContext) => boolean)
  | ((config: TConfig) => boolean)
  | ((config: TConfig, ctx: MatchContext) => boolean);

const matcherBlock: Block<MatchFunc, (ctx: MatchContext) => boolean> = {
  type: "matchers",
  introspect: {
    default: "0",
  },
  adapt:
    <TConfig = unknown>({ default: func }: { default: MatchFunc }) =>
    ($live: TConfig) => {
      return (ctx: MatchContext) => {
        const fMatcher = func as unknown as
          | ((c: TConfig, ctx: MatchContext) => boolean)
          | MatchFunc;
        const matcherFuncOrValue = fMatcher($live, ctx);
        if (typeof matcherFuncOrValue === "function") {
          return matcherFuncOrValue(ctx);
        }
        return matcherFuncOrValue;
      };
    },
  defaultPreview: async (matcher, { request }) => {
    const ctx = await request.json();
    return {
      Component: JsonViewer,
      props: {
        body: JSON.stringify({
          context: ctx,
          result: matcher(ctx),
        }),
      },
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
