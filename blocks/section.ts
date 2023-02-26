import { ComponentFunc, PreactComponent } from "$live/blocks/types.ts";
import { fnDefinitionToSchemeable } from "$live/blocks/utils.ts";
import { Block } from "$live/engine/block.ts";
import { findAllReturning } from "$live/engine/schema/utils.ts";
import { JSX } from "preact";

const sectionAddr = "$live/blocks/section.ts@Section";

const sectionJSONSchema = {
  $ref: `#/definitions/${sectionAddr}`,
};

const blockType = "section";
export type Section = JSX.Element;
const sectionBlock: Block<ComponentFunc<Section>, PreactComponent<Section>> = {
  import: import.meta.url,
  defaultJSONSchemaDefinitions: {
    [sectionAddr]: {
      type: "object",
    },
  },
  adapt: <TProps>(Component: ComponentFunc<Section>) => (props: TProps) => ({
    Component,
    props,
  }),
  type: blockType,
  findModuleDefinitions: async (transformContext, [path, ast]) => {
    const fns = await findAllReturning(
      transformContext,
      { typeName: "Section", importUrl: import.meta.url },
      ast,
    );
    const schemeables = await Promise.all(
      fns
        .map((fn) => ({
          name: fn.name === "default" ? path : `${path}@${fn.name}`,
          input: fn.params.length > 0 ? fn.params[0] : undefined,
          output: sectionJSONSchema,
        }))
        .map((fn) => fnDefinitionToSchemeable(transformContext, ast, fn)),
    );

    return {
      imports: schemeables.map((s) => s.id!),
      schemeables,
    };
  },
};

export default sectionBlock;
