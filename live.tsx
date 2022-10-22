import { Handlers, PageProps } from "$fresh/server.ts";
import { PageComponentData, PageData } from "$live/types.ts";
import InspectVSCodeHandler from "https://deno.land/x/inspect_vscode@0.0.5/handler.ts";
import { createServerTiming } from "$live/utils/serverTimings.ts";
import {
  componentsPreview,
  renderComponent,
  updateComponentProps,
} from "$live/canvas.tsx";
import { getComponentModule } from "$live/utils/component.ts";
import type { ComponentChildren } from "preact";

import { context } from "$live/server.ts";
import { loadData, loadLivePage, LoadLivePageOptions } from "$live/pages.ts";

export function live(
  options?: LoadLivePageOptions,
) {
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
      const pageData = await loadLivePage(req, ctx, options);
      end("load-page");

      if (url.searchParams.has("editorData")) {
        pageData.components = pageData.editorComponents!;
        delete pageData.editorComponents;
        return new Response(JSON.stringify(pageData, null, 2), {
          headers: { "Content-Type": "application/json" },
        });
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
      {components?.map(({ component, props }: PageComponentData) => {
        const Comp = getComponentModule(manifest, component)?.default;
        if (!Comp) {
          return;
        }
        return <Comp {...props} />;
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
  const InspectVSCode = context.deploymentId == undefined &&
    manifest.islands[`./islands/InspectVSCode.tsx`]?.default;

  const renderEditor = data.mode === "edit";

  return (
    <div class="flex">
      <div
        class={`w-full relative ${renderEditor ? "pr-80" : ""}`}
      >
        {children ? children : <LiveComponents {...data} />}
      </div>

      {InspectVSCode ? <InspectVSCode /> : null}
    </div>
  );
}
