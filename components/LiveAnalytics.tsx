import { context } from "$live/live.ts";
import Script from "https://deno.land/x/partytown@0.1.3/Script.tsx";
import Jitsu from "https://deno.land/x/partytown@0.1.3/integrations/Jitsu.tsx";
import type { Page } from "$live/types.ts";

const innerHtml = ({ id, path }: Partial<Page>) => `
import { onCLS, onFID, onLCP } from "https://esm.sh/web-vitals@3.1.0";

function onWebVitalsReport(event) {
  window.jitsu('track', 'web-vitals', event);
};

function init() {
  if (typeof window.jitsu !== "function") {
    return;
  }

  /* Add these trackers to all analytics sent to our server */
  window.jitsu('set', { page_id: "${id}", page_path: "${path}", site_id: "${context.siteId}" });
  /* Send page-view event */
  window.jitsu('track', 'pageview');

  /* Listen web-vitals */
  onCLS(onWebVitalsReport);
  onFID(onWebVitalsReport);
  onLCP(onWebVitalsReport);
};

if (document.readyState === 'complete') {
  init();
} else {
  window.addEventListener('load', init);
};
`;

type Props = Partial<Page>;

function LiveAnalytics({ id = -1, path = "defined_on_code" }: Props) {
  return (
    <>
      {context.isDeploy && ( // Add analytcs in production only
        <Jitsu
          data-init-only="true"
          data-key="js.9wshjdbktbdeqmh282l0th.c354uin379su270joldy2"
        />
      )}

      <Script
        type="module"
        dangerouslySetInnerHTML={{ __html: innerHtml({ id, path }) }}
      />
    </>
  );
}

export default LiveAnalytics;
