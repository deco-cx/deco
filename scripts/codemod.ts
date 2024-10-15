import {
  codeMod,
  type CodeModContext,
  denoJSON,
  rewriteImports,
  upgradeDeps,
} from "@deco/codemod-toolkit";
import { jsrLatest } from "@deco/codemod-toolkit/deno-json";
import { join } from "@std/path/join";

const DECO_PKGS = /(@deco\/.*)|(deco)|(\$live)/;
const PKGS_TO_CHECK = /(apps)|(deco-sites\/.*\/$)|(partytown)|(@deco\/warp)/;

const upgradeDecoVersion = upgradeDeps(DECO_PKGS, true);

const EXPORTS = {
  DECO: "@deco/deco",
  DECO_WEB: "@deco/deco/web",
  HTMX: "@deco/deco/htmx",
  O11Y: "@deco/deco/o11y",
  HOOKS: "@deco/deco/hooks",
  BLOCKS: "@deco/deco/blocks",
  UTILS: "@deco/deco/utils",
  DURABLE: "@deco/durable",
};
const OVERRIDE_FRESH_PREACT = {
  "preact": "npm:preact@10.23.1",
  "https://esm.sh/*preact-render-to-string@6.3.1":
    "npm:preact-render-to-string@6.4.2",
  "preact-render-to-string": "npm:preact-render-to-string@6.4.2",
};
const newJsrPackages = [
  EXPORTS.DECO,
  EXPORTS.DURABLE,
  "@deco/dev",
];

const LATEST_WORKING_ADMIN_V1_VERSION = "1.103.0";
const pinDecoVersion = denoJSON((json) => {
  let decoEntry = json.content.imports?.["deco/"];
  if (decoEntry) {
    const [registry] = decoEntry.split("@");
    decoEntry = `${registry}@${LATEST_WORKING_ADMIN_V1_VERSION}/`;
  }
  return {
    content: {
      ...json.content,
      imports: {
        ...json.content.imports,
        "@deco/deco": `jsr:@deco/deco@${LATEST_WORKING_ADMIN_V1_VERSION}`,
        ...decoEntry && { "deco/": decoEntry },
      },
    },
  };
});

export const runCodeMod = async (context?: CodeModContext): Promise<void> => {
  const newImportsPromise: Promise<Record<string, string>> = Promise.all(
    newJsrPackages.map((pkg) =>
      jsrLatest(pkg).then((jsrPkg) => [pkg, jsrPkg] as [string, string])
    ),
  ).then(Object.fromEntries);

  await codeMod({
    context,
    yPrompt: false,
    targets: [
      rewriteImports({
        "deco/utils/userAgent.ts": {
          Device: {
            moduleSpecifier: EXPORTS.UTILS,
          },
        },
        "deco/blocks/mod.ts": {
          Matcher: {
            moduleSpecifier: EXPORTS.DECO,
          },
        },
        "deco/runtime/htmx/mod.ts": {
          asset: {
            moduleSpecifier: EXPORTS.HTMX,
          },
          bindings: {
            moduleSpecifier: EXPORTS.HTMX,
          },
          Head: {
            moduleSpecifier: EXPORTS.HTMX,
          },
        },
        "deco/utils/dataURI.ts": {
          scriptAsDataURI: {
            name: "useScript",
            moduleSpecifier: EXPORTS.BLOCKS,
          },
        },
        "deco/runtime/handler.tsx": {
          useFramework: {
            moduleSpecifier: EXPORTS.DECO,
          },
        },
        "deco/utils/invoke.ts": {
          isEventStreamResponse: {
            moduleSpecifier: EXPORTS.DECO_WEB,
          },
          StreamProps: {
            moduleSpecifier: EXPORTS.DECO,
          },
        },
        "deco/deco.ts": {
          Pagination: {
            moduleSpecifier: EXPORTS.DURABLE,
          },
          HistoryEvent: {
            moduleSpecifier: EXPORTS.DURABLE,
          },
          Context: {
            moduleSpecifier: EXPORTS.DECO,
          },
          context: {
            moduleSpecifier: EXPORTS.DECO,
          },
          RequestContext: {
            moduleSpecifier: EXPORTS.DECO,
          },
        },
        "deco/engine/block.ts": {
          BlockKeys: {
            moduleSpecifier: EXPORTS.DECO,
            isTypeOnly: true,
          },
          BlockFunc: {
            moduleSpecifier: EXPORTS.DECO,
            isTypeOnly: true,
          },
          BlockFromKey: {
            moduleSpecifier: EXPORTS.DECO,
            isTypeOnly: true,
          },
          ComponentFunc: {
            moduleSpecifier: EXPORTS.BLOCKS,
            isTypeOnly: true,
          },
          ComponentMetadata: {
            moduleSpecifier: EXPORTS.BLOCKS,
            isTypeOnly: true,
          },
          PreactComponent: {
            moduleSpecifier: EXPORTS.DECO,
          },
        },
        "deco/runtime/fetch/mod.ts": {
          RequestInit: {
            moduleSpecifier: EXPORTS.DECO,
            isTypeOnly: true,
          },
          fetch: {
            moduleSpecifier: EXPORTS.DECO,
          },
        },
        "deco/hooks/useDevice.ts": {
          useDevice: {
            moduleSpecifier: EXPORTS.HOOKS,
          },
        },
        "deco/hooks/useScript.ts": {
          useScript: {
            moduleSpecifier: EXPORTS.HOOKS,
          },
          useScriptAsDataURI: {
            moduleSpecifier: EXPORTS.HOOKS,
          },
        },
        "deco/blocks/section.ts": {
          isSection: {
            moduleSpecifier: EXPORTS.BLOCKS,
          },
          Section: {
            moduleSpecifier: EXPORTS.BLOCKS,
            isTypeOnly: true,
          },
          SectionProps: {
            moduleSpecifier: EXPORTS.DECO,
            isTypeOnly: true,
          },
        },
        "deco/clients/withManifest.ts": {
          withManifest: {
            moduleSpecifier: EXPORTS.DECO_WEB,
          },
          forApp: {
            moduleSpecifier: EXPORTS.DECO_WEB,
          },
          proxy: {
            moduleSpecifier: EXPORTS.DECO_WEB,
          },
        },
        "deco/hooks/usePartialSection.ts": {
          usePartialSection: {
            moduleSpecifier: EXPORTS.HOOKS,
          },
        },
        "deco/hooks/useSection.ts": {
          useSection: {
            moduleSpecifier: EXPORTS.HOOKS,
          },
        },
        "deco/engine/errors.ts": {
          HttpError: {
            moduleSpecifier: EXPORTS.DECO,
          },
          shortcircuit: {
            moduleSpecifier: EXPORTS.DECO,
          },
        },
        "deco/blocks/handler.ts": {
          Handler: {
            moduleSpecifier: EXPORTS.BLOCKS,
            isTypeOnly: true,
          },
        },
        "deco/engine/manifest/manifestGen.ts": {
          decoManifestBuilder: {
            moduleSpecifier: EXPORTS.UTILS,
          },
        },
        "deco/engine/manifest/manifest.ts": {
          RouteContext: {
            moduleSpecifier: EXPORTS.DECO,
          },
        },
        "deco/engine/core/mod.ts": {
          ResolveOptions: {
            moduleSpecifier: EXPORTS.DECO,
          },
        },
        "deco/types.ts": {
          LoaderReturnType: {
            moduleSpecifier: EXPORTS.DECO,
            isTypeOnly: true,
          },
          SectionProps: {
            moduleSpecifier: EXPORTS.DECO,
            isTypeOnly: true,
          },
          Site: {
            moduleSpecifier: EXPORTS.DECO,
            isTypeOnly: true,
          },
          DecoState: {
            moduleSpecifier: EXPORTS.DECO,
            isTypeOnly: true,
          },
          DecoSiteState: {
            moduleSpecifier: EXPORTS.DECO,
            isTypeOnly: true,
          },
          ActionContext: {
            moduleSpecifier: EXPORTS.DECO,
            isTypeOnly: true,
          },
          FunctionContext: {
            moduleSpecifier: EXPORTS.DECO,
            isTypeOnly: true,
          },
          AppRuntime: {
            moduleSpecifier: EXPORTS.DECO,
            isTypeOnly: true,
          },
          LoaderFunction: {
            moduleSpecifier: EXPORTS.DECO,
            isTypeOnly: true,
          },
          FnContext: {
            moduleSpecifier: EXPORTS.DECO,
            isTypeOnly: true,
          },
          AppManifest: {
            moduleSpecifier: EXPORTS.DECO,
            isTypeOnly: true,
          },
          Flag: {
            moduleSpecifier: EXPORTS.DECO,
            isTypeOnly: true,
          },
          LoadingFallbackProps: {
            moduleSpecifier: EXPORTS.DECO,
            isTypeOnly: true,
          },
        },
        "deco/blocks/page.tsx": {
          Page: {
            moduleSpecifier: EXPORTS.BLOCKS,
            isTypeOnly: true,
          },
        },
        "deco/utils/admin.ts": {
          adminUrlFor: {
            moduleSpecifier: EXPORTS.UTILS,
          },
          isAdmin: {
            moduleSpecifier: EXPORTS.UTILS,
          },
        },
        "deco/live.ts": {
          context: {
            moduleSpecifier: EXPORTS.DECO,
          },
          Context: {
            moduleSpecifier: EXPORTS.DECO,
          },
        },
        "deco/utils/object.ts": {
          tryOrDefault: {
            moduleSpecifier: EXPORTS.UTILS,
          },
        },
        "deco/utils/http.ts": {
          allowCorsFor: {
            moduleSpecifier: EXPORTS.DECO,
          },
          readFromStream: {
            moduleSpecifier: EXPORTS.UTILS,
          },
        },
        "deco/blocks/account.ts": {
          Accounts: {
            moduleSpecifier: EXPORTS.BLOCKS,
            isTypeOnly: true,
          },
        },
        "deco/engine/core/hints.ts": {
          HintNode: {
            moduleSpecifier: EXPORTS.DECO,
            isTypeOnly: true,
          },
        },
        "deco/components/JsonViewer.tsx": {
          JsonViewer: {
            moduleSpecifier: EXPORTS.UTILS,
          },
        },
        "deco/utils/metabase.tsx": {
          metabasePreview: {
            moduleSpecifier: EXPORTS.UTILS,
          },
        },
        "deco/blocks/flag.ts": {
          FlagObj: {
            moduleSpecifier: EXPORTS.BLOCKS,
            isTypeOnly: true,
          },
          Variant: {
            moduleSpecifier: EXPORTS.BLOCKS,
            isTypeOnly: true,
          },
          MultivariateFlag: {
            moduleSpecifier: EXPORTS.BLOCKS,
            isTypeOnly: true,
          },
          Flag: {
            moduleSpecifier: EXPORTS.BLOCKS,
            isTypeOnly: true,
          },
        },
        "deco/blocks/loader.ts": {
          Loader: {
            moduleSpecifier: EXPORTS.BLOCKS,
            isTypeOnly: true,
          },
        },
        "deco/blocks/utils.tsx": {
          buildImportMap: {
            moduleSpecifier: EXPORTS.BLOCKS,
          },
          createBagKey: {
            moduleSpecifier: EXPORTS.BLOCKS,
          },
        },
        "deco/blocks/workflow.ts": {
          WorkflowFn: {
            moduleSpecifier: EXPORTS.BLOCKS,
          },
          WorkflowContext: {
            moduleSpecifier: EXPORTS.BLOCKS,
          },
          Workflow: {
            moduleSpecifier: EXPORTS.BLOCKS,
          },
        },
        "deco/blocks/app.ts": {
          AppContext: {
            moduleSpecifier: EXPORTS.DECO,
            isTypeOnly: true,
          },
          ImportMap: {
            moduleSpecifier: EXPORTS.BLOCKS,
          },
          buildImportMap: {
            moduleSpecifier: EXPORTS.BLOCKS,
          },
          Apps: {
            moduleSpecifier: EXPORTS.BLOCKS,
            isTypeOnly: true,
          },
        },
        "deco/utils/invoke.types.ts": {
          AvailableActions: {
            moduleSpecifier: EXPORTS.DECO,
            isTypeOnly: true,
          },
          AvailableLoaders: {
            moduleSpecifier: EXPORTS.DECO,
            isTypeOnly: true,
          },
        },
        "deco/components/section.tsx": {
          SectionContext: {
            moduleSpecifier: EXPORTS.BLOCKS,
          },
        },
        "deco/observability/mod.ts": {
          logger: {
            moduleSpecifier: EXPORTS.O11Y,
          },
        },
        "deco/mod.ts": {
          status: {
            moduleSpecifier: EXPORTS.DECO,
          },
          Resolvable: {
            moduleSpecifier: EXPORTS.DECO,
            isTypeOnly: true,
          },
          shortcircuit: {
            moduleSpecifier: EXPORTS.DECO,
          },
          LoaderReturnType: {
            moduleSpecifier: EXPORTS.DECO,
            isTypeOnly: true,
          },
          Deco: {
            moduleSpecifier: EXPORTS.DECO,
          },
          Flag: {
            moduleSpecifier: EXPORTS.DECO,
            isTypeOnly: true,
          },
          SectionProps: {
            moduleSpecifier: EXPORTS.DECO,
            isTypeOnly: true,
          },
          AppModule: {
            moduleSpecifier: EXPORTS.DECO,
          },
          redirect: {
            moduleSpecifier: EXPORTS.DECO,
          },
          AppManifest: {
            moduleSpecifier: EXPORTS.DECO,
            isTypeOnly: true,
          },
          context: {
            moduleSpecifier: EXPORTS.DECO,
          },
          asResolved: {
            moduleSpecifier: EXPORTS.DECO,
          },
          isDeferred: {
            moduleSpecifier: EXPORTS.DECO,
          },
          usePageContext: {
            moduleSpecifier: EXPORTS.DECO,
          },
          useRouterContext: {
            moduleSpecifier: EXPORTS.DECO,
          },
          ManifestOf: {
            moduleSpecifier: EXPORTS.DECO,
            isTypeOnly: true,
          },
          AppRuntime: {
            moduleSpecifier: EXPORTS.DECO,
            isTypeOnly: true,
          },
          DecoState: {
            moduleSpecifier: EXPORTS.DECO,
            isTypeOnly: true,
          },
          DecoSiteState: {
            moduleSpecifier: EXPORTS.DECO,
            isTypeOnly: true,
          },
          Site: {
            moduleSpecifier: EXPORTS.DECO,
            isTypeOnly: true,
          },
          allowCorsFor: {
            moduleSpecifier: EXPORTS.DECO,
          },
          DECO_SEGMENT: {
            moduleSpecifier: EXPORTS.DECO,
          },
          AppMiddlewareContext: {
            moduleSpecifier: EXPORTS.DECO,
            isTypeOnly: true,
          },
          LoaderContext: {
            moduleSpecifier: EXPORTS.DECO,
            isTypeOnly: true,
          },
          ActionContext: {
            moduleSpecifier: EXPORTS.DECO,
            isTypeOnly: true,
          },
          FnContext: {
            moduleSpecifier: EXPORTS.DECO,
            isTypeOnly: true,
          },
          WorkflowGen: {
            moduleSpecifier: EXPORTS.DECO,
            isTypeOnly: true,
          },
          WorkflowContext: {
            moduleSpecifier: EXPORTS.BLOCKS,
          },
          AppContext: {
            moduleSpecifier: EXPORTS.DECO,
            isTypeOnly: true,
          },
          App: {
            moduleSpecifier: EXPORTS.DECO,
            isTypeOnly: true,
          },
          notFound: {
            moduleSpecifier: EXPORTS.DECO,
          },
          forbidden: {
            moduleSpecifier: EXPORTS.DECO,
          },
          unauthorized: {
            moduleSpecifier: EXPORTS.DECO,
          },
          badRequest: {
            moduleSpecifier: EXPORTS.DECO,
          },
          LoadingFallbackProps: {
            moduleSpecifier: EXPORTS.DECO,
            isTypeOnly: true,
          },
          Resolved: {
            moduleSpecifier: EXPORTS.DECO,
            isTypeOnly: true,
          },
        },
        "deco/blocks/matcher.ts": {
          MatchContext: {
            moduleSpecifier: EXPORTS.BLOCKS,
            isTypeOnly: true,
          },
          Matcher: {
            moduleSpecifier: EXPORTS.BLOCKS,
            isTypeOnly: true,
          },
        },

        "deco/engine/schema/lazy.ts": {
          lazySchemaFor: {
            moduleSpecifier: EXPORTS.DECO,
          },
        },
        "deco/deps.ts": {
          Pagination: {
            moduleSpecifier: EXPORTS.DURABLE,
          },
          HistoryEvent: {
            moduleSpecifier: EXPORTS.DURABLE,
          },
          workflowHTTPHandler: {
            moduleSpecifier: EXPORTS.DURABLE,
          },
          RuntimeParameters: {
            moduleSpecifier: EXPORTS.DURABLE,
          },
          Arg: {
            moduleSpecifier: EXPORTS.DURABLE,
          },
          WorkflowExecutionBase: {
            moduleSpecifier: EXPORTS.DURABLE,
          },
          JSONSchema7: {
            moduleSpecifier: EXPORTS.DECO,
            isTypeOnly: true,
          },
          weakcache: {
            moduleSpecifier: EXPORTS.DECO,
          },
          ValueType: {
            moduleSpecifier: EXPORTS.O11Y,
          },
        },
        "deco/observability/otel/metrics.ts": {
          meter: {
            moduleSpecifier: EXPORTS.O11Y,
          },
        },
        "deco/engine/core/resolver.ts": {
          Resolved: {
            moduleSpecifier: EXPORTS.DECO,
            isTypeOnly: true,
          },
          ResolveFunc: {
            moduleSpecifier: EXPORTS.DECO,
          },
          isResolvable: {
            moduleSpecifier: EXPORTS.DECO,
          },
          BaseContext: {
            moduleSpecifier: EXPORTS.DECO,
            isTypeOnly: true,
          },
          Resolvable: {
            moduleSpecifier: EXPORTS.DECO,
            isTypeOnly: true,
          },
          isDeferred: {
            moduleSpecifier: EXPORTS.DECO,
          },
          asResolved: {
            moduleSpecifier: EXPORTS.DECO,
          },
        },
        "deco/engine/core/utils.ts": {
          PromiseOrValue: {
            moduleSpecifier: EXPORTS.UTILS,
          },
          singleFlight: {
            moduleSpecifier: EXPORTS.UTILS,
          },
          notUndefined: {
            moduleSpecifier: EXPORTS.UTILS,
          },
          isAwaitable: {
            moduleSpecifier: EXPORTS.UTILS,
          },
        },
        "deco/observability/otel/config.ts": {
          logger: {
            moduleSpecifier: EXPORTS.O11Y,
          },
        },
      }),
      denoJSON(async ({ content: denoJSON }) => {
        const { "preact/": _, ...imports } = denoJSON.imports ??
          {};
        const bundleCmd = denoJSON.tasks?.bundle;
        let appName = "";
        if (typeof bundleCmd === "string") {
          const parts = bundleCmd.split(" ");
          appName = parts[parts.length - 1];
        }
        return {
          content: {
            ...denoJSON,
            lock: false,
            tasks: {
              ...denoJSON.tasks ?? {},
              start:
                "deno run -A --unstable-http --env https://deco.cx/run -- deno task dev",
              bundle: `deno run -A jsr:@deco/deco/scripts/bundle ${appName}`,
              update: `deno run -Ar https://deco.cx/update`,
              reload: "deno cache -r https://deco.cx/run",
              dev: "deno run -A --env --unstable-kv --unstable-hmr dev.ts",
            },
            imports: {
              ...imports,
              ...OVERRIDE_FRESH_PREACT,
              ...(await newImportsPromise),
            },
          },
        };
      }),
      { // TODO fix this to remove tailwind css.
        options: {
          match: [/fresh.config.ts$/],
        },
        apply: (txt) => {
          const regex = /^import plugins from ['"].*['"](;?)$/gm;
          return {
            content: txt.content.replace(
              regex,
              `import { plugins } from "deco/plugins/deco.ts";`,
            ).replace(`import tailwind from "./tailwind.config.ts";\n`, "")
              .replace("tailwind,\n", "").replace(
                `tailwind: tailwind as any,`,
                "",
              ).replace(
                `// @ts-expect-error somehow this typing doesnt work\n`,
                "",
              ),
          };
        },
      },
      upgradeDeps(PKGS_TO_CHECK, true),
      {
        options: upgradeDecoVersion.options,
        apply: async (txt, ctx) => {
          const isAdminV2 = await ctx.fs.exists(join(ctx.fs.cwd(), ".deco"));
          if (isAdminV2) {
            return upgradeDecoVersion.apply(txt, ctx);
          }
          return pinDecoVersion.apply(txt, ctx);
        },
      },
      {
        options: {
          match: [/dev.ts$/],
        },
        apply: (txt) => {
          if (txt.content.includes("@deco/dev/tailwind")) {
            return txt;
          }
          return {
            content:
              `import { build } from "@deco/dev/tailwind";\nawait build();\n${
                txt.content.replace(`#!/usr/bin/env -S deno run -A --watch`, "")
              }`,
          };
        },
      },
    ],
  });
};
