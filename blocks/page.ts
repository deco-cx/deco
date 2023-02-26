import { ComponentFunc, PreactComponent } from "$live/blocks/types.ts";
import { fnDefinitionToSchemeable } from "$live/blocks/utils.ts";
import { Block } from "$live/engine/block.ts";
import { findAllReturning } from "$live/engine/schema/utils.ts";
import { JSX } from "preact";

const pageAddr = "$live/blocks/page.ts@Page";

const pageJSONSchema = {
  $ref: `#/definitions/${pageAddr}`,
};
const blockType = "page";
export type Page = JSX.Element;

const pageBlock: Block<ComponentFunc<Page>, PreactComponent<Page>> = {
  import: import.meta.url,
  defaultJSONSchemaDefinitions: {
    [pageAddr]: {
      type: "object",
    },
  },
  adapt:
    <TProps>(Component: ComponentFunc<Page, TProps>) => (props: TProps) => ({
      Component,
      props,
    }),
  type: blockType,
  findModuleDefinitions: async (transformContext, [path, ast]) => {
    const fns = await findAllReturning(
      transformContext,
      { typeName: "Page", importUrl: import.meta.url },
      ast,
    );
    const schemeables = await Promise.all(
      fns
        .map((fn) => ({
          name: fn.name === "default" ? path : `${path}@${fn.name}`,
          input: fn.params.length > 0 ? fn.params[0] : undefined,
          output: pageJSONSchema,
        }))
        .map((fn) => fnDefinitionToSchemeable(transformContext, ast, fn)),
    );

    return {
      imports: schemeables.map((s) => s.id!),
      schemeables,
    };
  },
};

export default pageBlock;
