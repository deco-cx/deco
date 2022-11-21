import Script from "https://deno.land/x/partytown@0.1.0/Script.tsx";
import { Page, Site } from "$live/types.ts";

const innerHtml = ({ id, path }: Page, { id: siteId }: Site) => `
import { onCLS, onFID, onLCP } from "https://esm.sh/web-vitals@3.1.0";

function onWebVitalsReport(event) {
  if (typeof window.jitsu === "function") {
    window.jitsu('track', 'web-vitals', { ...event, page_id: "${id}", page_path: "${path}", site_id: "${siteId}" });
  }
};

onCLS(onWebVitalsReport);
onFID(onWebVitalsReport);
onLCP(onWebVitalsReport);
`;

interface Props {
  page: Page;
  site: Site
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
