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

const onError = ( message, url, lineNo, columnNo, error) => {
    window.jitsu('track', 'error', {message, url,  lineNo, columnNo, error_stack: error.stack, error_name: error.name})
}

const init = async () => {
  if (typeof window.jitsu !== "function") {
    return;
  }

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

if (document.readyState === 'complete') {
  init();
} else {
  window.addEventListener('load', init);
};

window.onerror = function (message, url, lineNo, columnNo, error) {
  onError(message, url, lineNo, columnNo, error)
}
`;

type Props = Partial<Page> & { flags?: Flags };

const IS_TESTING_JITSU = true;

function LiveAnalytics({ id = -1, path = "defined_on_code", flags }: Props) {
  return (
    <>
      <Head>
        {/* 
        1. Extrair essa string pra um const errorHandlingScript = `...`
        2. O jitsu não vai estar disponível nesse momento aqui (ou no onError do script), então precisa de outra estratégia. 

          Sugestão:

          Cria uma variável global chamada window.__decoLoadingErrors = [];
          Para cada onerror que acontecer, dá push nessa variávels
          No script acima (que roda depois), faz um __decoLoadingErrors.forEach(error => {
            // Logica para mandar o erro pro Jitsu
          })
        
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `const scripts = document.querySelectorAll("script");
            console.log('now here')
console.log([...scripts].map(e => e.src))
scripts.forEach((e) => e.onerror = () => { console.log("onError " + e.src) })`,
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
