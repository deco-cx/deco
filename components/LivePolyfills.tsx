import { Head } from "$fresh/runtime.ts";

// Polyfills required for our inline scripts to work on our targeted browsers
const snippet = () => {
  // Required for Safari
  window.requestIdleCallback = window.requestIdleCallback ||
    ((callback: IdleRequestCallback) => setTimeout(callback, 0));
};

function LivePolyfills() {
  return (
    <Head>
      <script dangerouslySetInnerHTML={{ __html: `(${snippet})()` }} />
    </Head>
  );
}

export default LivePolyfills;
