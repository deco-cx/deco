import { Block } from "$live/block.ts";
import { ComponentFunc, PreactComponent } from "$live/blocks/loader.ts";
import { findAllReturning } from "$live/engine/schema/utils.ts";
import { JSX } from "https://esm.sh/v103/preact@10.11.3/src/index";

const sectionAddr = "$live/blocks/section.ts@Section";

const sectionJSONSchema = {
  $ref: `#/definitions/${sectionAddr}`,
};

export type Section = JSX.Element;
const sectionBlock: Block<ComponentFunc<Section>, PreactComponent<Section>> = {
  defaultJSONSchemaDefinitions: {
    [sectionAddr]: {
      type: "object",
    },
  },
  preview: (section) => {
    return section;
  },
  // TODO inspect?
  run: (section, ctx) => {
    return ctx.context.render(section);
  },
  adapt:
    <TProps>(Component: ComponentFunc<Section>) =>
    (props: TProps) => ({ Component, props }),
  type: "section",
  findModuleDefinitions: async (ast) => {
    const fns = await findAllReturning(
      { typeName: "Section", importUrl: import.meta.url },
      ast
    );
    return fns.map((fn) => ({
      name: fn.name,
      input: fn.params.length > 0 ? fn.params[0] : undefined,
      output: sectionJSONSchema,
    }));
  },
};

export default sectionBlock;
