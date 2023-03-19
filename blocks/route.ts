// deno-lint-ignore-file no-explicit-any
import { Handler, HandlerContext, Handlers, PageProps } from "$fresh/server.ts";
import {
  MiddlewareRoute,
  RouteConfig,
  RouteModule,
} from "$fresh/src/server/types.ts";
import { Block, BlockModuleRef, ComponentFunc } from "$live/engine/block.ts";
import { mapObjKeys } from "$live/engine/core/utils.ts";
import { tsTypeToSchemeable } from "$live/engine/schema/transform.ts";
import { context as liveContext } from "$live/live.ts";
import { DecoManifest, LiveState } from "$live/types.ts";
import {
  DocNode,
  ParamDef,
  TsTypeDef,
} from "https://deno.land/x/deno_doc@0.58.0/lib/types.d.ts";
import { METHODS } from "https://deno.land/x/rutt@0.0.13/mod.ts";

export interface LiveRouteConfig extends RouteConfig {
  liveKey?: string;
}

export interface LiveRouteModule extends RouteModule {
  config?: LiveRouteConfig;
}

type HandlerLike = Handler<any, any> | Handlers<any, any>;
type ConfigurableRoute = {
  handler?: HandlerLike;
  config: LiveRouteConfig;
};

const hasAnyMethod = (obj: Record<string, any>): boolean => {
  for (const method in METHODS) {
    if (obj[method]) {
      return true;
    }
  }
  return false;
};

const isConfigurableRoute = (
  v: DecoManifest["routes"][string] | ConfigurableRoute,
): v is ConfigurableRoute => {
  const handler = (v as RouteModule).handler;
  const defaultIsFunc = typeof (v as RouteModule).default === "function";
  const handlerIsFunc = typeof handler === "function";

  const handlerIsFuncMap = handler !== undefined &&
    typeof handler === "object" &&
    hasAnyMethod(handler);

  return (
    (handlerIsFunc || defaultIsFunc || handlerIsFuncMap) &&
    !Array.isArray((v as MiddlewareRoute).handler)
  );
};
const mapHandlers = (
  key: string,
  handlers: Handler<any, any> | Handlers<any, any> | undefined,
): Handler<any, any> | Handlers<any, any> => {
  if (typeof handlers === "object") {
    return mapObjKeys(handlers, (val) => {
      return async function (
        request: Request,
        context: HandlerContext<any, LiveState>,
      ) {
        const resolver = liveContext.configResolver!;

        const ctxResolver = resolver
          .resolverFor(
            { context, request },
            {
              monitoring: context?.state?.t
                ? {
                  t: context.state.t!,
                }
                : undefined,
            },
          )
          .bind(resolver);

        const $live = await ctxResolver(key);
        return val!(request, {
          ...context,
          state: {
            ...context.state,
            $live,
            resolve: ctxResolver,
          },
        });
      };
    });
  }
  return async function (
    request: Request,
    context: HandlerContext<any, LiveState>,
  ) {
    const resolver = liveContext.configResolver!;
    const ctxResolver = resolver
      .resolverFor(
        { context, request },
        {
          monitoring: context?.state?.t
            ? {
              t: context.state.t!,
            }
            : undefined,
        },
      )
      .bind(resolver);

    const $live = (await ctxResolver(key)) ?? {};

    if (typeof handlers === "function") {
      return await handlers(request, {
        ...context,
        state: {
          ...context.state,
          $live,
          resolve: ctxResolver,
        },
      });
    }
    return await context.render($live);
  };
};

export type Route<TProps = unknown> = ComponentFunc<PageProps<TProps>>;
const blockType = "routes";
const routeBlock: Block<Route, Response> = {
  decorate: (routeModule, key) => {
    if (
      isConfigurableRoute(routeModule) &&
      !key.includes("./routes/_middleware.ts")
    ) {
      const configurableRoute = routeModule;
      const handl = configurableRoute.handler;
      const liveKey = configurableRoute.config?.liveKey ?? key;
      return {
        ...routeModule,
        handler: mapHandlers(liveKey, handl),
      };
    }
    return routeModule;
  },
  introspect: async (_, path, ast) => {
    const routeMod: BlockModuleRef = {
      functionRef: path,
    };

    const handlerNode = ast.find(
      (node) => node.name === "handler" && node.declarationKind === "export",
    );
    const liveConfigImport = ast.find((node) => {
      return node.kind === "import" && node.importDef.imported === "LiveConfig";
    });
    if (handlerNode && liveConfigImport) {
      const configSchemeable = schemeableFromHandleNode(
        handlerNode,
        liveConfigImport.name,
      );
      if (configSchemeable) {
        return {
          ...routeMod,
          inputSchema: await tsTypeToSchemeable(configSchemeable, [path, ast]),
        };
      }
    } else {
      const defaultExport = ast.find((node) => node.name === "default");
      if (!defaultExport) {
        return routeMod;
      }
      let pagePropsParam: ParamDef | null = null;
      if (defaultExport.kind === "variable") {
        const variable = defaultExport.variableDef.tsType;
        if (variable!.kind !== "fnOrConstructor") {
          return routeMod;
        }
        const params = variable.fnOrConstructor.params;
        if ((params ?? null) === null || params.length === 0) {
          return routeMod;
        }
        pagePropsParam = params[0];
      } else if (defaultExport.kind === "function") {
        if (
          !defaultExport.functionDef.params ||
          defaultExport.functionDef.params.length === 0
        ) {
          return routeMod;
        }
        pagePropsParam = defaultExport.functionDef.params[0];
      }

      if (pagePropsParam === null || pagePropsParam.kind !== "identifier") {
        return routeMod;
      }
      const pagePropsTsType = pagePropsParam.tsType;
      if (pagePropsTsType!.kind !== "typeRef") {
        return routeMod;
      }
      const typeParams = pagePropsTsType.typeRef.typeParams;
      if (!typeParams || typeParams.length === 0) {
        return routeMod;
      }

      return {
        ...routeMod,
        inputSchema: await tsTypeToSchemeable(typeParams[0], [path, ast]),
      };
    }
    return routeMod;
  },
  type: blockType,
};

function schemeableFromHandleNode(
  handlerNode: DocNode,
  liveImportAs: string,
): TsTypeDef | null {
  let contextParam: ParamDef | null = null;
  if (handlerNode.kind === "function") {
    if (handlerNode.functionDef.params.length < 2) {
      return null;
    }
    contextParam = handlerNode.functionDef.params[1];
  } else if (handlerNode.kind === "variable") {
    const variable = handlerNode.variableDef.tsType;
    if (variable!.kind !== "fnOrConstructor") {
      return null;
    }
    const params = variable.fnOrConstructor.params;
    if (params.length < 2) {
      return null;
    }
    contextParam = params[1];
  }

  if (contextParam === null || contextParam === undefined) {
    return null;
  }
  if (contextParam.tsType!.kind !== "typeRef") {
    return null;
  }
  const typeParams = contextParam.tsType.typeRef.typeParams;
  if (
    typeParams === null || typeParams === undefined || typeParams.length < 2
  ) {
    return null;
  }

  const liveConfig = typeParams[1];
  if (liveConfig.kind !== "typeRef" || liveConfig.repr !== liveImportAs) {
    return null;
  }
  return liveConfig.typeRef.typeParams! && liveConfig.typeRef.typeParams[0]!;
}

export default routeBlock;
