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
  config: TConfig
) => (ctx: MatchContext) => boolean;

const isMatchFuncNoPartial = <TConfig = unknown>(
  f: MatchFunc<TConfig> | ((c: TConfig, ctx: MatchContext) => boolean)
): f is (c: TConfig, ctx: MatchContext) => boolean => {
  return f.arguments.length >= 2;
};

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
  adapt:
    <TConfig = unknown>({
      default: func,
    }: {
      default: (config: TConfig) => (ctx: MatchContext) => boolean;
    }) =>
    ($live: TConfig) => {
      if (isMatchFuncNoPartial(func)) {
        return (ctx) => func($live, ctx);
      }
      const matcher = func($live);
      return typeof matcher !== "function" ? () => matcher : matcher;
    },
};

export default matcherBlock;
