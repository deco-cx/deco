import { context } from "$live/live.ts";
import { Head } from "$fresh/runtime.ts";
import Script from "https://deno.land/x/partytown@0.1.3/Script.tsx";
import Jitsu from "https://deno.land/x/partytown@0.1.3/integrations/Jitsu.tsx";
import type { Flags, Page } from "$live/types.ts";

const innerHtml = (
  { id, path, flags = {} }: Partial<Page> & { flags?: Flags },
) => `
const onWebVitalsReport = (event) => {
  window.jitsu('track', 'web-vitals', event);
};

/* Send exception error to jitsu */
const onError = ( message, url, lineNo, columnNo, error) => {
    window.jitsu('track', 'error', {error_1type: "Exception",message, url,  lineNo, columnNo, error_stack: error.stack, error_name: error.name})
}

const init = async () => {
  if (typeof window.jitsu !== "function") {
    return;
  }

  /* Send scriptLoad event to jitsu */
  __decoLoadingErrors.forEach((e) => window.jitsu('track', 'error',{error_type:"ScriptLoad", url: e.src}))

  /* Add these trackers to all analytics sent to our server */
  window.jitsu('set', { page_id: "${id}", page_path: "${path}", site_id: "${context.siteId}", ${
  Object.keys(flags).map((key) => `flag_${key}: true`).join(",")
} });
  /* Send page-view event */
  window.jitsu('track', 'pageview');

  /* Listen web-vitals */
  const { onCLS, onFID, onLCP } = await import("https://esm.sh/v99/web-vitals@3.1.0/es2022/web-vitals.js");
      
  onCLS(onWebVitalsReport);
  onFID(onWebVitalsReport);
  onLCP(onWebVitalsReport);
};

  window.onerror = function (message, url, lineNo, columnNo, error) {
      onError(message, url, lineNo, columnNo, error)  
  }

  if (document.readyState === 'complete') {
      init();
  } else {
      window.addEventListener('load', init);
};
`;

type Props = Partial<Page> & { flags?: Flags };

// Get all the scripts and check which ones have errors
const errorHandlingScript = `
      window.__decoLoadingErrors = []
      const scripts = document.querySelectorAll("script");
      scripts.forEach((e) => e.onerror = () => __decoLoadingErrors.push(e.src))
`;

function LiveAnalytics({ id = -1, path = "defined_on_code", flags }: Props) {
  return (
    <>
      <Head>
        <script
          dangerouslySetInnerHTML={{
            __html: errorHandlingScript,
          }}
        >
        </script>
      </Head>
      {(context.isDeploy) && ( // Add analytcs in production only
        <Jitsu
          data-init-only="true"
          data-key="js.9wshjdbktbdeqmh282l0th.c354uin379su270joldy2"
        />
      )}

      <Script
        type="module"
        dangerouslySetInnerHTML={{ __html: innerHtml({ id, path, flags }) }}
      />
    </>
  );
}

export default LiveAnalytics;
