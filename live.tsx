import { Handlers, PageProps } from "$fresh/server.ts";
import { loadData, loadLivePage } from "$live/pages.ts";
import { context } from "$live/server.ts";
import { EditorData, Page, PageData } from "$live/types.ts";
import {
  filenameFromPath,
  getComponentList,
  getComponentModule,
} from "$live/utils/component.ts";
import { createServerTiming } from "$live/utils/serverTimings.ts";
import InspectVSCodeHandler from "inspect_vscode/handler.ts";

import type { ComponentChildren, FunctionComponent } from "preact";
export function live() {
  const handler: Handlers<Page> = {
    async GET(req, ctx) {
      const url = new URL(req.url);

      // TODO: Find a better way to embedded this route on project routes.
      // Follow up here: https://github.com/denoland/fresh/issues/516
      if (url.pathname.startsWith("/_live/components")) {
        return new Response(JSON.stringify(getComponentList()), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "Access-Control-Allow-Origin": "*",
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
      const pageWithParams = await loadLivePage(req);
      end("load-page");

      if (!pageWithParams) {
        return ctx.renderNotFound();
      }

      const { page, params = {} } = pageWithParams;

      console.log({ "Found Page": page });

      if (url.searchParams.has("editorData")) {
        const editorData = generateEditorData(page);
        return Response.json(editorData, {
          headers: {
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      start("load-data");
      const pageDataAfterLoaders = await loadData(
        req,
        {
          ...ctx,
          params,
        },
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
        url.pathname.startsWith("/_live/inspect") &&
        context.deploymentId === undefined
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
        const Comp =
          (getComponentModule(manifest, key)?.default) as FunctionComponent;

        return (
          <div id={uniqueId} data-manifest-key={key}>
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
  const LiveControls = !isProduction &&
    manifest.islands[`./islands/LiveControls.tsx`]?.default;

  return (
    <>
      {children ? children : <LiveComponents {...data.data} />}
      {LiveControls
        ? (
          <LiveControls
            site={{ id: context.siteId, name: context.site }}
            page={data}
            isProduction={isProduction}
          />
        )
        : null}
    </>
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
