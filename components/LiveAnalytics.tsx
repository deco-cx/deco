import { context } from "$live/live.ts";
import Script from "partytown/Script.tsx";
import Jitsu from "partytown/integrations/Jitsu.tsx";

declare global {
  interface Window {
    // deno-lint-ignore no-explicit-any
    jitsu: (...args: any[]) => void;
  }
}

const main = (
  userData: {
    page_id: string;
    page_path: string;
    site_id: string;
    active_flags: string;
  },
) => {
  const loadingErrors: string[] = [];

  // More info at:
  // https://stackoverflow.com/questions/9808307/how-to-get-the-number-of-dom-elements-used-in-a-web-page
  const getTotalDOMSize = (element: Element | ShadowRoot = document.body) => {
    let count = 0;
    let child = element.firstElementChild;
    while (child) {
      count += getTotalDOMSize(child);
      if (child.shadowRoot) count += getTotalDOMSize(child.shadowRoot);
      child = child.nextElementSibling;
      count++;
    }
    return count;
  };

  /**
   * Send report to admin and console.debug
   */
  const reportPerformance = (
    type: "web-vitals" | "resource" | "dom-elements" | "navigation",
    args: unknown,
  ) => top !== window && top?.postMessage({ type, args }, "*");

  const onWebVitalsReport = (event: unknown) => {
    window.jitsu?.("track", "web-vitals", event);
    reportPerformance("web-vitals", JSON.stringify(event));
  };

  /* Send exception error to jitsu */
  const onError = ({ message, url, lineNo, columnNo, error }: {
    message: string;
    url?: string;
    lineNo?: number;
    columnNo?: number;
    error: Error;
  }) =>
    window.jitsu?.("track", "error", {
      error_1type: "Exception",
      message,
      url,
      lineNo,
      columnNo,
      error_stack: error.stack,
      error_name: error.name,
    });

  requestIdleCallback(async () => {
    if (top !== window) {
      reportPerformance("dom-elements", getTotalDOMSize());

      if (typeof PerformanceObserver !== "undefined") {
        // Report main html timings
        reportPerformance(
          "navigation",
          JSON.stringify(
            performance.getEntriesByType("navigation")[0].toJSON(),
          ),
        );

        // Report secondary resources timings
        new PerformanceObserver((perf) =>
          perf.getEntries().forEach((entry) =>
            reportPerformance("resource", JSON.stringify(entry.toJSON()))
          )
        )
          .observe({ type: "resource", buffered: true });
      }
    }

    /* Listen web-vitals */
    const webVitals = await import(
      "https://esm.sh/v99/web-vitals@3.1.0/es2022/web-vitals.js"
    );

    webVitals.onCLS(onWebVitalsReport);
    webVitals.onFID(onWebVitalsReport);
    webVitals.onLCP(onWebVitalsReport);
    webVitals.onFCP(onWebVitalsReport);
    webVitals.onTTFB(onWebVitalsReport);

    if (typeof window.jitsu !== "function") {
      return;
    }

    /* Send scriptLoad event to jitsu */
    loadingErrors.forEach((e) =>
      window.jitsu("track", "error", {
        error_type: "ScriptLoad",
        url: (e as unknown as { src: string }).src,
      })
    );

    /* Add these trackers to all analytics sent to our server */
    window.jitsu("set", userData);
    /* Send page-view event */
    window.jitsu("track", "pageview");
  });

  const scripts = document.querySelectorAll("script");

  // Track script errors
  scripts.forEach((script) => {
    script.addEventListener("error", () => loadingErrors.push(script.src));
  });

  /* Send exception error event to jitsu */
  addEventListener("error", onError);
};

const innerHtml = (
  { id, path, flags }: Props,
) =>
  `(${main.toString()})({page_id: "${id}", page_path: "${path}", site_id: "${context.siteId}", active_flags: "${flags}"});
`;

type Props = Partial<{ id: number; path: string }> & { flags?: string };

/**
 * We don't send Jitsu events on localhost by default, so
 * turn this flag on if you want to test the event sending code.
 */
const IS_TESTING_JITSU = false;

function LiveAnalytics({ id = -1, path = "defined_on_code", flags }: Props) {
  return (
    <>
      <Script
        type="module"
        dangerouslySetInnerHTML={{ __html: innerHtml({ id, path, flags }) }}
      />

      {(context.isDeploy || IS_TESTING_JITSU) && ( // Add analytcs in production only
        <Jitsu
          data-init-only="true"
          data-key="js.9wshjdbktbdeqmh282l0th.c354uin379su270joldy2"
        />
      )}
    </>
  );
}

export default LiveAnalytics;
