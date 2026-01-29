# Fix ESM SSR Compatibility for Fresh 2 + Vite

## Context
The deco fresh2 branch needs to work with Fresh 2's Vite-based build system. Vite uses ESM (ECMAScript Modules) for SSR, which is incompatible with certain Node.js-specific CommonJS patterns.

## Current Problem
When running `deno task dev` (which uses Vite), we get this error:

```
(__vite_ssr_import_2__.__require ?? __vite_ssr_import_2__.default ?? __vite_ssr_import_2__) is not a function
at /node_modules/.deno/require-in-the-middle@7.5.2/node_modules/require-in-the-middle/index.js:5:15
```

The error chain shows:
1. `deco/deps.ts` imports `@opentelemetry/instrumentation-fetch`
2. Which imports `@opentelemetry/instrumentation`
3. Which uses `require-in-the-middle` - a CommonJS-only Node.js module that hooks into `require()`

## What Needs to Change

### 1. Make OpenTelemetry optional/conditional

The OpenTelemetry packages (`@opentelemetry/instrumentation`, `@opentelemetry/instrumentation-fetch`, etc.) use Node.js-specific CommonJS patterns that don't work in Vite's ESM SSR environment. Options:

- Lazy-load OpenTelemetry only when NOT in Vite dev mode
- Make it a runtime-only feature that's excluded from SSR builds
- Use `import()` with try/catch for graceful degradation
- Check for `typeof module !== 'undefined'` before using CommonJS features

### 2. Review all deps.ts exports

Check `deps.ts` and ensure all re-exported packages are ESM-compatible. Packages that use:
- `require()` 
- `module.exports`
- `require-in-the-middle`
- `import-in-the-middle`

...will fail in Vite SSR.

### 3. Avoid CommonJS-only npm packages in SSR code paths

For any package that must be CommonJS, ensure it's only loaded:
- At runtime (not during SSR/build)
- In a separate worker/process
- Behind dynamic `import()` with `/* @vite-ignore */`

## Testing

After changes, test with a Fresh 2 project:

```bash
deno task dev  # Should start Vite without CommonJS errors
```

The homepage should load without:
- `module is not defined`
- `__require is not a function`
- `ERR_UNSUPPORTED_ESM_URL_SCHEME`

## Reference

Vite's ESM SSR limitations:
- https://vitejs.dev/guide/ssr.html
- Only supports ESM, not CommonJS in SSR context
- Dynamic imports need `/* @vite-ignore */` for non-analyzable patterns
