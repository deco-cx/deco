import type { ComponentChildren } from "preact";
import { PageProps } from "$fresh/server.ts";
import { context } from "$live/live.ts";
import { Page } from "$live/types.ts";
import CoreWebVitals from "$live/components/CoreWebVitals.tsx";
import LiveSections from "$live/components/LiveSections.tsx";
import Jitsu from "https://deno.land/x/partytown@0.0.7/integrations/Jitsu.tsx";

const DEPLOY = Boolean(context.deploymentId);

export default function LivePage({
  data: page,
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
      {DEPLOY && ( // Add analytcs in production only
        <Jitsu data-key="js.9wshjdbktbdeqmh282l0th.c354uin379su270joldy2" />
      )}
      <CoreWebVitals page={page} />

      {children ? children : <LiveSections {...page.data} />}

      {LiveControls
        ? (
          <LiveControls
            site={{ id: context.siteId, name: context.site }}
            page={page}
            isProduction={isProduction}
          />
        )
        : null}
    </>
  );
}
