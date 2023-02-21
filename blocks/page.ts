import { PageProps } from "$fresh/server.ts";
import { Block, FunctionBlockDefinition } from "$live/block.ts";
import { ComponentFunc, PreactComponent } from "$live/blocks/loader.ts";
import { TsType } from "$live/engine/schema/ast.ts";
import { findAllReturning } from "$live/engine/schema/utils.ts";
import { JSX } from "preact";

const pageAddr = "$live/blocks/page.ts@Page";

const pageJSONSchema = {
  $ref: `#/definitions/${pageAddr}`,
};

export type Page = JSX.Element;
const pageBlock: Block<
  ComponentFunc<Page, PageProps>,
  PreactComponent<Page, PageProps>
> = {
  defaultJSONSchemaDefinitions: {
    [pageAddr]: {
      type: "object",
    },
  },
  preview: (page) => {
    return page;
  },
  // TODO inspect?
  run: (section, ctx) => {
    return ctx.context.render(section);
  },
  adapt:
    <TProps>(Component: ComponentFunc<Page, PageProps<TProps>>) =>
    (props: TProps) => ({ Component, props }),
  type: "page",
  findModuleDefinitions: async (ast) => {
    const fns = await findAllReturning(
      { typeName: "Page", importUrl: import.meta.url },
      ast
    );
    return fns.reduce((fns, fn) => {
      let typeRef: TsType | undefined = undefined;
      if (fn.params.length >= 1) {
        if (
          fn.params[0].kind !== "typeRef" ||
          !fn.params[0].typeRef.typeParams
        ) {
          return fns;
        }
        typeRef = fn.params[0].typeRef.typeParams[0];
      }
      return [
        ...fns,
        {
          name: fn.name,
          input: typeRef,
          output: pageJSONSchema,
        },
      ];
    }, [] as FunctionBlockDefinition[]);
  },
};

export default pageBlock;
