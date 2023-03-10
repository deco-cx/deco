import { InstanceOf } from "$live/blocks/types.ts";
import { configOnly } from "$live/blocks/utils.ts";
import JsonViewer from "$live/blocks/utils.tsx";
import { Block } from "$live/engine/block.ts";

export type Matcher = InstanceOf<typeof matcherBlock, "#/root/matchers">;

export interface MatchContext {
  siteId: number;
  request: Request;
}

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

export default matcherBlock;
