# deco on Cloudflare Workers (workerd)

Experimental. These helpers let an existing Fresh + deco site run inside a
Cloudflare Worker without rewriting it. The site is bundled with `deno bundle`
and runs on workerd with `nodejs_compat`.

```ts
import {
  installDenoShim,
  keepCacheWritesAlive,
  runWithExecutionContext,
} from "@deco/deco/workerd";
import files from "./vfs.js"; // decofile blocks, Fresh snapshot, deno.json

let app;
export default {
  fetch(req, env, ctx) {
    app ??= runWithExecutionContext(ctx, async () => {
      installDenoShim({ env, files });
      keepCacheWritesAlive();
      // The site bundle must be evaluated AFTER the shim is installed.
      const { boot } = await import("./app.js");
      return (await boot()).createApp();
    });
    return runWithExecutionContext(ctx, async () => (await app)(req));
  },
};
```

A complete setup (build script, wrangler config) lives in the Aviator site:
`worker/` in `deco-sites/aviator`.

## What each piece does

- `installDenoShim({ env, files, cwd })` installs a `globalThis.Deno` backed by
  the Worker env (string bindings only) and an in-memory, read-only file system
  (`files`). Writes go to an ephemeral overlay. Subprocesses, `Deno.serve`, KV
  and cron throw `Deno.errors.NotSupported`. `Deno.upgradeWebSocket` uses
  `WebSocketPair`.
- `keepCacheWritesAlive()` wraps `caches.open()` so `put`/`delete` join the
  current request's `waitUntil`. deco writes loader results without awaiting
  them; without this, workerd cancels the write when the response is sent and
  later hits read truncated JSON.
- `runWithExecutionContext(ctx, fn)` / `waitUntil(promise)` keep background work
  alive for the current request.

## Constraints a site bundle has to respect

- workerd runs every module body in "global scope", where timers, random values
  and I/O are forbidden, even for modules imported lazily. Fresh, deco and the
  apps do all three at module level, so the site bundle has to be wrapped so its
  body runs inside a request (see `wrapInBoot` in the Aviator build script).
- `import.meta.url` is undefined on workerd; replace it at build time.
- Do not use `--keep-names`: esbuild then injects `__name()` into functions that
  deco serializes to the browser.
- Code must not rely on `Function.prototype.name` (bundlers rename functions).
  This change fixes the places in the engine that did.
- WebAssembly cannot be compiled from bytes at runtime. Modules that do it at
  load time (e.g. lz4 in the Redis cache) must load it lazily.

## Not supported yet

- Admin/editor routes that read TypeScript sources at runtime (`/deco/meta`
  builds JSON schemas from the files).
- Background revalidation (`stale-while-revalidate`) runs outside the request
  that triggered it and may be cut short.
- Redis loader cache (`ioredis` needs TCP sockets).
