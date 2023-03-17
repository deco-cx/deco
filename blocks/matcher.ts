import { configOnly } from "$live/blocks/utils.ts";
import JsonViewer from "$live/blocks/utils.tsx";
import { Block, InstanceOf } from "$live/engine/block.ts";

// @ts-ignore: "waiting for the engine to be completed"
export type Matcher = InstanceOf<typeof matcherBlock, "#/root/matchers">;

// deno-lint-ignore no-explicit-any
export type MatchContext<T = any> = T & {
  siteId: number;
  request: Request;
};

type MatchFunc<TConfig = unknown> = (
  config: TConfig,
) => (ctx: MatchContext) => boolean;

const matcherBlock: Block<MatchFunc> = {
  type: "matchers",
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
  introspect: configOnly(`./matchers`),
  adapt: <TConfig = unknown>({
    default: func,
  }: {
    default: (config: TConfig) => (ctx: MatchContext) => boolean;
  }) =>
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
};

/**
 * (config:TConfig) => (matchCtx: MatchContext) => boolean
 * (config:TConfig, matchCtx: MatchContext) => boolean
 * (config:TConfig) => boolean
 * Matchers are functions that takes a match context as a parameter and returns a boolean.
 */
export default matcherBlock;
