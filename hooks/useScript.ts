// deno-lint-ignore-file no-explicit-any
/**
 * By importing this file, you will get a `wasm` module added to your server
 * while it's booting. If it fails to load, your server will hang indefinitely.
 *
 * Use at your own risk.
 */

import { initSync, transform } from "npm:@swc/wasm-web@1.5.25/wasm-web.js";
import { LRUCache } from "npm:lru-cache@10.2.0";

const swcPromise = initSync(
  "https://cdn.jsdelivr.net/npm/@swc/wasm-web@1.5.25/wasm-web_bg.wasm",
);

const verbose = !!Deno.env.get("SCRIPT_MINIFICATION_DEBUG");

const cache = new LRUCache<string, string | Promise<string | null>>({
  max: 100,
});

const timings = (js: string) => {
  const start = performance.now();

  return () => {
    const duration = performance.now() - start;
    console.log(
      `[script-minification]: ${duration}ms minifiying script ${
        js.slice(0, 38).replace(/(\n|\s)+/g, " ")
      }...`,
    );
  };
};

const minify = async (js: string) => {
  try {
    await swcPromise;

    const log = verbose ? timings(js) : null;

    const result = await transform(js, {
      minify: true,
      jsc: {
        target: "es2022" as const,
        minify: { mangle: true, format: { comments: false } },
      },
    }, undefined);

    const code = result.code.replace(/;$/, "") as string;

    log?.();

    return code;
  } catch (error) {
    console.error({ error });

    return null;
  }
};

export function useScript<T extends (...args: any[]) => any>(
  fn: T,
  ...params: Parameters<T>
) {
  const javascript = fn.toString();
  const cached = cache.get(javascript) || minify(javascript);

  if (typeof cached === "object") {
    cache.set(javascript, cached);

    cached.then((minified) => {
      if (minified === null) {
        cache.delete(javascript);
      } else {
        cache.set(javascript, minified);
      }
    });
  }

  const minified = typeof cached === "string" ? cached : javascript;

  return `(${minified})(${params.map((p) => JSON.stringify(p)).join(", ")})`;
}

export function useScriptAsDataURI<T extends (...args: any[]) => any>(
  fn: T,
  ...params: Parameters<T>
) {
  return `data:text/javascript,${encodeURIComponent(useScript(fn, ...params))}`;
}
