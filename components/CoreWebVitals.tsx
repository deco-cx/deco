import Script from "partytown/Script.tsx";
import { Page } from "$live/types.ts";

const innerHtml = ({ id, path }: Page) => `
import { onCLS, onFID, onLCP } from "https://esm.sh/web-vitals@3.1.0";

function onWebVitalsReport(event) {
  if (typeof window.jitsu === "function") {
    window.jitsu('track', 'web-vitals', { ...event, page_id: "${id}", page_path: "${path}" });
  }
};

onCLS(onWebVitalsReport);
onFID(onWebVitalsReport);
onLCP(onWebVitalsReport);
`;

interface Props {
  page: Page;
}

function CoreWebVitals({ page }: Props) {
  return (
    <Script
      type="module"
      dangerouslySetInnerHTML={{ __html: innerHtml(page) }}
    />
  );
}

export default CoreWebVitals;
