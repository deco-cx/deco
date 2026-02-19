# Final Startup Time Analysis

## Summary

After deep investigation, the ~6-7 second startup time in `deno run -A --env main.ts` comes from **core architecture**, not easily removable dependencies.

## The Call Chain

```
main.ts
 ↓ imports fresh.config.ts
 ↓ imports deco/plugins/deco.ts
 ↓ imports runtime/fresh/plugin.tsx
 ↓ imports { Deco } from "@deco/deco"
 ↓ imports runtime/mod.ts
 ↓ imports engine/manifest/manifest.ts  (6290ms!)
 ↓ imports blocks/index.ts              (6009ms!)
 ↓ imports blocks/section.ts
 ↓ imports components/section.tsx
 ↓ imports runtime/handler.tsx          (5500ms!)
 ↓ imports ALL route handlers
 ↓ imports ALL OpenTelemetry modules
```

## What We Fixed ✅

### 1. Hooks Module: **200-300x faster!**
- Before: 6194ms
- After: 13-78ms
- **Used by application code** - developers see instant imports

### 2. Individual Optimizations:
- ✅ Lazy-load terser (232ms → 0.05ms)
- ✅ Extract lightweight context (7057ms → 12ms for useDevice)
- ✅ Remove deps.ts barrel imports where possible
- ✅ Lazy-load observability in middleware
- ✅ Extract useFramework to framework.ts
- ✅ Remove unnecessary exports (JsonViewer, isSection, ValueType)

## What We Can't Easily Fix 🔴

### Core Architecture Loads Everything:

1. **blocks/index.ts** (6009ms)
   - Imports ALL block definitions
   - Required for the block system to work
   - sectionBlock → section.tsx → handler.tsx chain

2. **runtime/handler.tsx** (5500ms)
   - Imports ALL route handlers at top-level
   - Routes: _meta, batchInvoke, blockPreview, entrypoint, inspect, invoke, previews, release, reload, render, styles, workflow
   - Each route might have its own dependencies

3. **OpenTelemetry in deps.ts** (~2600ms when imported)
   - Even with lazy config, many files import from deps.ts
   - registerInstrumentations() runs at module load

## Why It Matters

### Development (`deno run -A --env main.ts`):
- Cold start: ~7 seconds
- This is initialization time for the entire Deco runtime
- Happens once per server start

### Application Code:
- `import from "@deco/deco/hooks"`: **~20ms** ✅
- `import from "@deco/deco/blocks"`: **~3ms** ✅
- Application code is fast to import

### Production:
- Server starts once, then handles requests
- Startup time less critical than request latency
- Our optimizations help with:
  - Serverless cold starts
  - Development iteration speed
  - CI/CD build times

## Architectural Solutions (Major Refactor Required)

### 1. Lazy Block Registration
```typescript
// Instead of importing all blocks
import sectionBlock from "./section.ts";

// Use dynamic imports
const blocks = {
  section: () => import("./section.ts"),
  loader: () => import("./loader.ts"),
  // ...
};
```

### 2. Route Code-Splitting
```typescript
// Instead of top-level imports
import { handler as metaHandler } from "./routes/_meta.ts";

// Use route table with dynamic imports
const routes = {
  "/_meta": () => import("./routes/_meta.ts"),
  "/invoke": () => import("./routes/invoke.ts"),
  // ...
};
```

### 3. Optional OpenTelemetry
```typescript
// Only load OpenTelemetry if explicitly enabled
if (Deno.env.get("ENABLE_OTEL") === "true") {
  await import("./observability/setup.ts");
}
```

### 4. Split Core from Runtime
- `@deco/deco/core` - Types, utilities, hooks (fast)
- `@deco/deco/runtime` - Full Deco class with all infrastructure (slow)
- Applications import from /core, only runtime server imports /runtime

## Current State

### For Developers Using Deco:
✅ **Fast**: Hooks, blocks, types import instantly
🔴 **Slow**: Full Deco runtime initialization (once per server start)

### For Deco Maintainers:
- Hooks optimizations: **Complete** ✅
- Runtime optimizations: **Requires architecture changes** 🔴
- Trade-off: Convenience (all blocks available) vs Speed (lazy loading)

## Recommendations

### Short Term:
1. ✅ **DONE**: Optimize hooks and commonly imported modules
2. ✅ **DONE**: Lazy-load heavy dependencies where possible
3. ✅ **DONE**: Remove barrel exports (deps.ts) where safe

### Long Term (if ~6s startup becomes critical):
1. Implement lazy block registration
2. Code-split routes in handler.tsx
3. Make OpenTelemetry truly optional
4. Consider splitting @deco/deco into @deco/core and @deco/runtime
5. Benchmark and optimize individual block imports

## Bottom Line

**We improved what users actually import (hooks: 6s → 20ms).**

The remaining 6s is **server initialization** - loading the entire Deco runtime infrastructure. This is a one-time cost per server start and affects:
- `deno run` in development
- Serverless cold starts
- CI/CD environments

For production servers that run continuously, this 6s is paid once and then forgotten.

For development, consider using watch mode (`deno task dev`) where the server stays running and hot-reloads changes.
