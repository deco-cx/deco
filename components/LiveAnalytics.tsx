import { context } from "$live/live.ts";
import Script from "https://deno.land/x/partytown@0.2.1/Script.tsx";
import Jitsu from "https://deno.land/x/partytown@0.2.1/integrations/Jitsu.tsx";
import type { Flags, Page } from "$live/types.ts";

declare global {
  interface Window {
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
  const islands: string[] = [];
  const loadingErrors: string[] = [];

  /**
   * Send report to admin and console.debug
   */
  const reportPerformance = (
    type: "web-vitals" | "islands",
    name: string,
    value: number | string[],
    rating = "",
  ) => {
    const isLocalhost = location?.origin.includes("localhost");

    if (top !== window) {
      top?.postMessage({ type, args: { name, rating, value } }, "*");
    }

    if (isLocalhost) {
      console.info(
        `[Performance]:`,
        `%c${name}`,
        'font',
        typeof value === "number" ? value.toFixed(2) : `${value.length}, islands: ${value.join(', ')}`,
        rating,
      );
    }
  };

  const onWebVitalsReport = (event: unknown) => {
    window.jitsu?.("track", "web-vitals", event);

    reportPerformance("web-vitals", event.name, event.value, event.rating);
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
    reportPerformance("islands", "Islands", islands);

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
      window.jitsu("track", "error", { error_type: "ScriptLoad", url: e.src })
    );

    /* Add these trackers to all analytics sent to our server */
    window.jitsu("set", { ...userData, page_islands: islands.join(",") });
    /* Send page-view event */
    window.jitsu("track", "pageview");
  });

  const isIsland = (src: string) =>
    /(.*)\/_frsh\/js\/(.*)\/island-(.*)\.js$/g.test(src);

  const scripts = document.querySelectorAll("script");

  // Track script errors
  scripts.forEach((script) => {
    script.addEventListener("error", () => loadingErrors.push(script.src));

    if (isIsland(script.src)) {
      const [_, islandName] = script.src.split("island-");
      islands.push(islandName.replace(".js", ""));
    }
  });

  /* Send exception error event to jitsu */
  addEventListener("error", onError);
};

const innerHtml = (
  { id, path, flags = {} }: Partial<Page> & { flags?: Flags },
) =>
  `(${main.toString()})({page_id: "${id}", page_path: "${path}", site_id: "${context.siteId}", active_flags: "${
    Object.keys(flags).join(",")
  }"});
`;

type Props = Partial<Page> & { flags?: Flags };

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
