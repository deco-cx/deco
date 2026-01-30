# Fix ESM SSR Compatibility for Fresh 2 + Vite

## Context
The deco fresh2 branch needs to work with Fresh 2's Vite-based build system. Vite uses ESM (ECMAScript Modules) for SSR, which is incompatible with certain Node.js-specific CommonJS patterns.

## Current Problem (UPDATED)
After fixing `require-in-the-middle`, there's still a deeper issue:

```
require is not defined
at @opentelemetry/resources/src/detectors/platform/node/machine-id/getMachineId.ts:22:8
```

The `@opentelemetry/resources` package uses native Node.js `require()` directly in its code. This means the ENTIRE OpenTelemetry dependency tree is incompatible with Vite SSR, not just the instrumentation packages.

### Previous error (now fixed):
```
(__vite_ssr_import_2__.__require ?? __vite_ssr_import_2__.default ?? __vite_ssr_import_2__) is not a function
at /node_modules/.deno/require-in-the-middle@7.5.2/node_modules/require-in-the-middle/index.js:5:15
```

## What Needs to Change

### 1. COMPLETELY exclude OpenTelemetry from SSR code paths

The ENTIRE OpenTelemetry stack (`@opentelemetry/resources`, `@opentelemetry/sdk-metrics`, `@opentelemetry/otlp-transformer`, etc.) uses Node.js `require()` directly in their code. Lazy-loading alone is NOT enough.

**Required approach:**
- Do NOT import any OpenTelemetry packages in code that runs during SSR
- Use runtime detection to skip OpenTelemetry entirely during Vite dev:

```typescript
// Check if we're in Vite SSR mode
const isViteSSR = typeof __vite_ssr_import__ !== 'undefined' || 
                  import.meta.env?.DEV;

// Only initialize OpenTelemetry when NOT in Vite SSR
if (!isViteSSR && typeof Deno !== 'undefined') {
  // Dynamic import with Vite ignore comment
  const otel = await import(/* @vite-ignore */ '@opentelemetry/api');
  // ... setup code
}
```

- Or better: move ALL OpenTelemetry code to a separate entry point that's only loaded at actual runtime (not during SSR/build)
- The deco/deps.ts must NOT statically export OpenTelemetry types/functions

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

## Summary

The OpenTelemetry npm packages are fundamentally incompatible with Vite's ESM SSR:

1. `@opentelemetry/instrumentation` → uses `require-in-the-middle` ❌
2. `@opentelemetry/resources` → uses native `require()` ❌
3. `@opentelemetry/sdk-metrics` → depends on resources ❌
4. `@opentelemetry/otlp-transformer` → depends on sdk-metrics ❌

**The fix must ensure ZERO OpenTelemetry code is evaluated during Vite SSR.**

Options:
- A) Completely remove OpenTelemetry from deco for Fresh 2 + Vite builds
- B) Move OpenTelemetry to a separate optional package/plugin
- C) Only load OpenTelemetry after detecting we're in actual Deno runtime (not Vite)
