// deno-lint-ignore-file no-explicit-any
import { Handler, HandlerContext, Handlers } from "$fresh/server.ts";
import { LiveRouteConfig } from "$live/blocks/types.ts";
import {
  DecoManifest,
  FreshContext,
} from "$live/engine/adapters/fresh/manifest.ts";
import { ConfigurableBlock } from "$live/engine/block.ts";
import { Rezolver } from "$live/engine/core/mod.ts";
import { mapObjKeys } from "$live/engine/core/utils.ts";
import { Param, TsType } from "$live/engine/schema/ast.ts";
import { tsTypeToSchemeable } from "$live/engine/schema/transform.ts";
import { context as liveContext } from "$live/live.ts";
import { ASTNode } from "../engine/schema/ast.ts";

type HandlerLike = Handler<any, any> | Handlers<any, any>;
type ConfigurableRoute = {
  handler?: HandlerLike;
  config: LiveRouteConfig & { liveKey: string };
};

const isConfigurableRoute = (
  v: DecoManifest["routes"][string] | ConfigurableRoute
): v is ConfigurableRoute => {
  return (v as ConfigurableRoute)?.config?.liveKey !== undefined;
};
const mapHandlers = (
  key: string,
  rz: Rezolver<FreshContext>,
  handlers: Handler<any, any> | Handlers<any, any> | undefined
): Handler<any, any> | Handlers<any, any> => {
  if (typeof handlers === "object") {
    return mapObjKeys(handlers, (val) => {
      return async function (request: Request, context: HandlerContext) {
        const $live = await rz.resolve(key, {
          context,
          request,
        });
        return val!(request, {
          ...context,
          state: { ...context.state, $live },
        });
      };
    });
  }
  return async function (request: Request, context: HandlerContext) {
    const $live =
      (await rz.resolve(key, {
        context,
        request,
      })) ?? {};

    if (typeof handlers === "function") {
      return handlers(request, {
        ...context,
        state: { ...context.state, $live },
      });
    }
    return context.render($live);
  };
};

const blockType = "route";
const routeBlock: ConfigurableBlock<DecoManifest["routes"][string]> = {
  import: import.meta.url,
  type: blockType,
  adapt: (route) => {
    if (isConfigurableRoute(route)) {
      const configurableRoute = route;
      const handl = configurableRoute.handler;
      const liveKey = configurableRoute.config?.liveKey;
      return {
        ...route,
        handler: mapHandlers(liveKey, liveContext.configResolver!, handl),
      };
    }
    return route;
  },
  findModuleDefinitions: async (transformContext, [path, ast]) => {
    if (!path.startsWith("./routes/")) {
      return { imports: [], schemeables: [] };
    }
    const definitions = {
      imports: [`${path}@$`], // adding $ on the end of the path to mark as default exported
      schemeables: [],
    };

    const handlerNode = ast.find(
      (node) => node.name === "handler" && node.declarationKind === "export"
    );
    const liveConfigImport = ast.find((node) => {
      return node.kind === "import" && node.importDef.imported === "LiveConfig";
    });

    if (handlerNode && liveConfigImport) {
      const handlerSchemeable = schemeableFromHandleNode(
        handlerNode,
        liveConfigImport.name
      );
      if (handlerSchemeable) {
        return {
          ...definitions,
          schemeables: [
            await tsTypeToSchemeable(transformContext, handlerSchemeable, [
              path,
              ast,
            ]),
          ],
        };
      }
    } else {
      const defaultExport = ast.find((node) => node.name === "default");
      if (!defaultExport) {
        return definitions;
      }
      let pagePropsParam: Param | null = null;
      if (defaultExport.kind === "variable") {
        const variable = defaultExport.variableDef.tsType;
        if (variable.kind !== "fnOrConstructor") {
          return definitions;
        }
        const params = variable.fnOrConstructor.params;
        if ((params ?? null) === null || params.length === 0) {
          return definitions;
        }
        pagePropsParam = params[0];
      } else if (defaultExport.kind === "function") {
        if (
          !defaultExport.functionDef.params ||
          defaultExport.functionDef.params.length === 0
        ) {
          return definitions;
        }
        pagePropsParam = defaultExport.functionDef.params[0];
      }

      if (pagePropsParam === null || pagePropsParam.kind !== "object") {
        return definitions;
      }
      const pagePropsTsType = pagePropsParam.tsType;
      if (pagePropsTsType.kind !== "typeRef") {
        return definitions;
      }
      const typeParams = pagePropsTsType.typeRef.typeParams;
      if (!typeParams || typeParams.length === 0) {
        return definitions;
      }
      return {
        ...definitions,
        schemeables: [
          await tsTypeToSchemeable(transformContext, typeParams[0], [
            path,
            ast,
          ]),
        ],
      };
    }
    return definitions;
  },
};

export default routeBlock;

function schemeableFromHandleNode(
  handlerNode: ASTNode,
  liveImportAs: string
): TsType | null {
  let contextParam: Param | null = null;
  if (handlerNode.kind === "function") {
    if (handlerNode.functionDef.params.length < 2) {
      return null;
    }
    contextParam = handlerNode.functionDef.params[1];
  } else if (handlerNode.kind === "variable") {
    const variable = handlerNode.variableDef.tsType;
    if (variable.kind !== "fnOrConstructor") {
      return null;
    }
    const params = variable.fnOrConstructor.params;
    if (params.length < 2) {
      return null;
    }
    contextParam = params[1];
  }

  if (contextParam === null) {
    return null;
  }
  if (contextParam.tsType.kind !== "typeRef") {
    return null;
  }
  const typeParams = contextParam.tsType.typeRef.typeParams;
  if (typeParams === null || typeParams.length < 2) {
    return null;
  }

  const liveConfig = typeParams[1];
  if (liveConfig.kind !== "typeRef" || liveConfig.repr !== liveImportAs) {
    return null;
  }
  return liveConfig.typeRef.typeParams && liveConfig.typeRef.typeParams[0];
}
