import type { ComponentChildren } from "preact";
import { Handlers, PageProps } from "$fresh/server.ts";
import { EditorData, Page, PageData } from "$live/types.ts";
import InspectVSCodeHandler from "https://deno.land/x/inspect_vscode@0.0.5/handler.ts";
import { createServerTiming } from "$live/utils/serverTimings.ts";
import { filenameFromPath, getComponentModule } from "$live/utils/component.ts";

import { context } from "$live/server.ts";
import { loadData, loadLivePage } from "$live/pages.ts";
import { ___tempMigratePageData } from "./utils/supabase.ts";

export function live() {
  const handler: Handlers<Page> = {
    async GET(req, ctx) {
      const url = new URL(req.url);
      // TODO: Find a better way to embedded this route on project routes.
      // Follow up here: https://github.com/denoland/fresh/issues/516
      const component = url.searchParams.get("component");
      if (
        url.pathname.startsWith("/live/api/components") &&
        typeof component === "string"
      ) {
        return ctx.render({
          id: -1,
          name: "The Impossible Page",
          path: "/",
          data: {
            components: [
              {
                key: `./components/${component}`,
                label: "",
                uniqueId: "",
                props: {},
              },
            ],
            loaders: [],
          },
        });
      }

      const { start, end, printTimings } = createServerTiming();

      if (!context.domains.includes(url.hostname)) {
        console.log("Domain not found:", url.hostname);
        console.log("Configured domains:", context.domains);

        // TODO: render custom 404 page
        return new Response("Site not found", { status: 404 });
      }

      // TODO: Fetch flags with stale cache and use them to select page
      // start("load-flags");
      // await ensureFlags();
      // end("load-flags");

      start("load-page");
      const page = await loadLivePage(req);
      console.log({ "Found Page": page });
      end("load-page");

      if (url.searchParams.has("editorData")) {
        // ALERT: This is only being used while we're developing this refact.

        // TODO: Perform this to all pages when we release this
        // or continue doing it gracefully
        const _______needsMigration = page?.data?.components?.some(
          (c) => (c as unknown as any)["component"],
        );

        if (_______needsMigration) {
          const updatedPage = await ___tempMigratePageData(page);

          const editorData = generateEditorData(updatedPage);
          return Response.json(editorData);
        }

        const editorData = generateEditorData(page);
        return Response.json(editorData);
      }

      start("load-data");
      const pageDataAfterLoaders = await loadData(
        req,
        ctx,
        page?.data,
        start,
        end,
      );
      end("load-data");

      start("render");
      const res = await ctx.render({ ...page, data: pageDataAfterLoaders });
      end("render");

      res.headers.set("Server-Timing", printTimings());

      return res;
    },
    async POST(req, ctx) {
      const url = new URL(req.url);
      if (
        url.pathname === "/inspect-vscode" &&
        context.deploymentId !== undefined
      ) {
        return await InspectVSCodeHandler.POST!(req, ctx);
      }

      return new Response("Not found", { status: 404 });
    },
  };

  return handler;
}

export function LiveComponents({ components }: PageData) {
  const manifest = context.manifest!;
  return (
    <>
      {components?.map(({ key, props, uniqueId }) => {
        const Comp = getComponentModule(manifest, key)?.default;

        return (
          <div id={uniqueId}>
            <Comp {...props} />
          </div>
        );
      })}
    </>
  );
}

export function LivePage({
  data,
  children,
}: PageProps<Page> & {
  children?: ComponentChildren;
}) {
  const manifest = context.manifest!;
  // TODO: Read this from context
  const isProduction = context.deploymentId !== undefined;
  const InjectLiveScripts = !isProduction &&
    manifest.islands[`./islands/InjectLiveScripts.tsx`]?.default;

  return (
    <div>
      {children ? children : <LiveComponents {...data.data} />}
      {InjectLiveScripts ? <InjectLiveScripts page={data} /> : null}
    </div>
  );
}

/**
 * Based on data from the backend and the page's manifest,
 * generates all the necessary information for the CMS
 *
 * TODO: After we approve this, move this function elsewhere
 */
function generateEditorData(page: Page): EditorData {
  const {
    data: { components, loaders },
  } = page;

  const componentsWithSchema = components.map(
    (component): EditorData["components"][0] => ({
      ...component,
      schema: context.manifest?.components[component.key]?.schema,
    }),
  );

  const loadersWithSchema = loaders.map((loader): EditorData["loaders"][0] => ({
    ...loader,
    schema: context.manifest?.loaders[loader.key]?.default?.inputSchema,
    // TODO: We might move this to use $id instead
    outputSchema: context.manifest?.loaders[loader.key]?.default
      ?.outputSchema?.["$ref"] as string,
  }));

  const availableComponents = Object.keys(
    context.manifest?.components || {},
  ).map((componentKey) => {
    const schema = context.manifest?.components[componentKey]?.schema;
    const label = filenameFromPath(componentKey);

    // TODO: Should we extract defaultProps from the schema here?

    return {
      key: componentKey,
      label,
      props: {},
      schema,
    } as EditorData["availableComponents"][0];
  });

  const availableLoaders = Object.keys(context.manifest?.loaders || {}).map(
    (loaderKey) => {
      const { inputSchema, outputSchema } =
        context.manifest?.loaders[loaderKey]?.default || {};
      const label = filenameFromPath(loaderKey);

      // TODO: Should we extract defaultProps from the schema here?

      return {
        key: loaderKey,
        label,
        props: {},
        schema: inputSchema,
        // TODO: Centralize this logic
        outputSchema: outputSchema?.$ref,
      } as EditorData["availableLoaders"][0];
    },
  );

  return {
    pageName: page?.name,
    components: componentsWithSchema,
    loaders: loadersWithSchema,
    availableComponents,
    availableLoaders,
  };
}
