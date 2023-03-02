import { context } from "$live/live.ts";
import { Head } from "$fresh/runtime.ts";
import Script from "https://deno.land/x/partytown@0.2.1/Script.tsx";
import Jitsu from "https://deno.land/x/partytown@0.2.1/integrations/Jitsu.tsx";
import type { Flags, Page } from "$live/types.ts";

const innerHtml = (
  { id, path, flags = {} }: Partial<Page> & { flags?: Flags },
) => `
const pushToJitsu = (...args) => typeof window.jitsu === 'function' && window.jitsu(...args)
const pushToDatalayer = (arg) => window.dayaLayer && window.dayaLayer.push && window.dataLayer.push(arg)

const onWebVitalsReport = (event) => {
  pushToJitsu('track', 'web-vitals', event);
};

/* Send exception error to jitsu */
const onError = (message, url, lineNo, columnNo, error) => {
  pushToJitsu('track', 'error', { error_1type: "Exception", message, url, lineNo, columnNo, error_stack: error.stack, error_name: error.name })
}

const init = async () => {
  /* Send scriptLoad event to jitsu */
  __decoLoadingErrors.forEach((e) => pushToJitsu('track', 'error', { error_type: "ScriptLoad", url: e.src }))

  /* Add these trackers to all analytics sent to our server */
  const flags = ${JSON.stringify(Object.entries(flags))};

pushToJitsu('set', {
  page_id: "${id}",
  page_path: "${path}",
  site_id: "${context.siteId}",
  active_flags: flags.map(([key]) => key).join(",")
});

for (const [key, value] of flags) {
  pushToDatalayer({
    'event': 'live-flag',
    'live-flagKey': key,
    'live-flagValue': value,
  });
}

/* Send page-view event */
pushToJitsu('track', 'pageview');

/* Listen web-vitals */
const { onCLS, onFID, onLCP } = await import("https://esm.sh/v110/web-vitals@3.1.1/es2022/web-vitals.js");

onCLS(onWebVitalsReport);
onFID(onWebVitalsReport);
onLCP(onWebVitalsReport);
};
/* Send exception error event to jitsu */
window.addEventListener('error', function ({ message, url, lineNo, columnNo, error }) {
  onError(message, url, lineNo, columnNo, error)
})

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
      scripts.forEach((e) => {e.onerror = () => __decoLoadingErrors.push(e.src)})
`;

/**
 * We don't send Jitsu events on localhost by default, so
 * turn this flag on if you want to test the event sending code.
 */
const IS_TESTING_JITSU = false;

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
      {(context.isDeploy || IS_TESTING_JITSU) && ( // Add analytcs in production only
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
