import { Handlers, PageProps } from "$fresh/server.ts";
import {
  EditorData,
  Page,
  PageComponent,
  PageData,
  PageLoader,
} from "$live/types.ts";
import InspectVSCodeHandler from "https://deno.land/x/inspect_vscode@0.0.5/handler.ts";
import { createServerTiming } from "$live/utils/serverTimings.ts";
import {
  componentsPreview,
  renderComponent,
  updateComponentProps,
} from "$live/canvas.tsx";
import { filenameFromPath, getComponentModule } from "$live/utils/component.ts";
import type { ComponentChildren, Context } from "preact";

import { context } from "$live/server.ts";
import { loadData, loadLivePage } from "$live/pages.ts";
import { ___tempMigratePageData } from "./utils/supabase.ts";

export function live() {
  const handler: Handlers<PageData> = {
    async GET(req, ctx) {
      const url = new URL(req.url);
      // TODO: Find a better way to embedded this route on project routes.
      // Follow up here: https://github.com/denoland/fresh/issues/516
      if (url.pathname === "/live/api/components") {
        return componentsPreview(req);
      }

      if (url.pathname.startsWith("/live/api/components/")) {
        return renderComponent(req);
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
      const page = await loadLivePage(req, ctx);
      end("load-page");

      if (url.searchParams.has("editorData")) {
        // ALERT: This is only being used while we're developing this refact.

        // TODO: Perform this to all pages when we release this
        // or continue doing it gracefully
        const _______needsMigration = page?.data?.components?.some(
          (c) => (c as unknown as any)["component"]
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
      await loadData(req, ctx, pageData, start, end);
      end("load-data");

      start("render");
      const res = await ctx.render(pageData);
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
      if (url.pathname === "/live/api/editor") {
        return await updateComponentProps(req, ctx);
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
      {components?.map(({ component, props, id }: PageComponentData) => {
        const Comp = getComponentModule(manifest, component)?.default;

        return (
          <div id={id}>
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
}: PageProps<PageData> & {
  children?: ComponentChildren;
}) {
  const manifest = context.manifest!;
  const InspectVSCode =
    context.deploymentId == undefined &&
    manifest.islands[`./islands/InspectVSCode.tsx`]?.default;

  const renderEditor = data.mode === "edit";

  return (
    <div class="flex">
      <div class={`w-full relative ${renderEditor ? "pr-80" : ""}`}>
        {children ? children : <LiveComponents {...data} />}
      </div>

      {InspectVSCode ? <InspectVSCode /> : null}
    </div>
  );
}

/**
 *
 * @param page
 * @returns
 */
function generateEditorData(page: Page): EditorData {
  const {
    data: { components, loaders },
    name,
  } = page;

  const componentsWithSchema = components.map(
    (component): EditorData["components"][0] => ({
      ...component,
      schema: context.manifest?.components[component.path]?.schema,
    })
  );

  const loadersWithSchema = components.map(
    (loader): EditorData["loaders"][0] => ({
      ...loader,
      schema: context.manifest?.loaders[loader.key]?.default?.inputSchema,
      // TODO: We might move this to use $id instead
      outputSchema: context.manifest?.loaders[loader.key]?.default
        ?.outputSchema?.["$ref"] as string,
    })
  );

  const availableComponents = Object.keys(
    context.manifest?.components || {}
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

  const availableLoaders = Object.keys(context.manifest?.components || {}).map(
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
    }
  );

  return {
    pageName: page?.name,
    components: componentsWithSchema,
    loaders: loadersWithSchema,
    availableComponents,
    availableLoaders,
  };
}
