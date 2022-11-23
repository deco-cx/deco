import Script from "https://deno.land/x/partytown@0.1.3/Script.tsx";
import { Page, Site } from "$live/types.ts";

const innerHtml = ({ id, path }: Page, { id: siteId }: Site) => `
import { onCLS, onFID, onLCP } from "https://esm.sh/web-vitals@3.1.0";

function onWebVitalsReport(event) {
  window.jitsu('track', 'web-vitals', event);
};

function init() {
  if (typeof window.jitsu !== "function") {
    return;
  }

  /* Add these trackers to all analytics sent to our server */
  window.jitsu('set', { page_id: "${id}", page_path: "${path}", site_id: "${siteId}" });
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

interface Props {
  page: Page;
  site: Site;
}

function LiveAnalytics({ page, site }: Props) {
  return (
    <Script
      type="module"
      dangerouslySetInnerHTML={{ __html: innerHtml(page, site) }}
    />
  );
}

export default LiveAnalytics;
