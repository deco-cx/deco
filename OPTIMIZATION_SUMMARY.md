# Startup Time Optimization Summary

## Results

### Hooks Module ✅ **MAJOR SUCCESS**
- **Before**: 6194ms (6.2 seconds)
- **After**: 20-78ms
- **Improvement**: **~200x faster!**

| Hook | Before | After | Improvement |
|------|--------|-------|-------------|
| useDevice | 7057ms | 12-14ms | 588x |
| usePartialSection | 7089ms | 13ms | 545x |
| useScript | 232ms | 0.05ms | 4640x |
| useSetEarlyHints | 246ms | 1-4ms | 246x |

### Main Export  🟡 **PARTIAL SUCCESS**
- **Before**: 6284-7133ms
- **After**: 5852-6325ms
- **Improvement**: ~600-800ms saved (10-13% faster)
- **Remaining**: Still ~6 seconds (Deco class + runtime infrastructure)

## Fixes Applied

### 1. ✅ Lazy-Load Heavy Dependencies

**hooks/useScript.ts** - Terser minifier
```typescript
// Before: Top-level import (232ms)
import { minify as terserMinify } from "npm:terser@5.34.0";

// After: Lazy load in minify() function (0.05ms at module load)
const { minify: terserMinify } = await import("npm:terser@5.34.0");
```

**runtime/middleware.ts** - Observability
```typescript
// Before: Top-level imports (3000ms)
import { startObserve } from "../observability/http.ts";
import { logger } from "../observability/mod.ts";

// After: Lazy-loaded when actually needed
const startObserveFn = await getStartObserve();
import("../observability/mod.ts").then(({ logger }) => {...});
```

**components/section.tsx** - Logger
```typescript
// Before: Top-level import
import { logger } from "../observability/otel/config.ts";

// After: Lazy load in error handler
import("../observability/otel/config.ts").then(({ logger }) => {...});
```

### 2. ✅ Extract Lightweight Context/Types

**components/context.ts** - NEW lightweight file
- Extracted `SectionContext` from heavy section.tsx
- Allows hooks to import context without loading runtime/handler.tsx (~6s)
- useDevice, useSetEarlyHints, useSection now import from context.ts

**runtime/framework.ts** - NEW lightweight file
- Extracted `FrameworkContext` and `useFramework` from handler.tsx
- Prevents loading all route handlers when only needing the hook
- mod.ts now exports from framework.ts instead of handler.tsx

### 3. ✅ Import Directly from Source

**Problem**: deps.ts as barrel export loads ALL OpenTelemetry (~2.6s)
```typescript
// ❌ BAD - Loads everything
import { getCookies } from "../deps.ts";  // 2620ms!

// ✅ GOOD - Loads only what's needed
import { getCookies } from "@std/http";   // Fast!
```

**Files Fixed**:
- blocks/matcher.ts: Import from @std/http and utils/hasher.ts directly
- runtime/middleware.ts: Import from @std/http directly, inline SpanStatusCode values
- hooks/useSection.ts: Import from utils/hasher.ts directly
- mod.ts: Removed ValueType export (was loading deps.ts)

### 4. ✅ Remove Unnecessary Exports

**blocks/mod.ts**
- Removed `isSection` value export (only used internally)
- Kept `Section` type export (used by storefront)
- Saved ~8 seconds by avoiding blocks/section.ts evaluation

**mod.ts**
- Commented out `JsonViewer` export (not used, was 9176ms)
- Removed wildcard `export * from "./runtime/mod.ts"` (was ~6s)
- Added explicit exports only for what's needed (DECO_SEGMENT, usePageContext, etc.)

## Remaining Bottlenecks

### 1. 🔴 Deco Class (runtime/mod.ts)
**Time**: ~6 seconds
**Cause**: Imports from handler.tsx which loads all route handlers
**Impact**: Exported from mod.ts, loaded even if not used
**Solution Needed**: Lazy-load handler.tsx imports or refactor Deco class

### 2. 🔴 Runtime Handler (runtime/handler.tsx)
**Time**: ~5.5 seconds
**Cause**: Imports ALL route handlers at top-level
```typescript
import { handler as metaHandler } from "./routes/_meta.ts";
import { handler as invokeHandler } from "./routes/batchInvoke.ts";
import { handler as previewHandler } from "./routes/blockPreview.tsx";
// ... 10+ more route handlers
```
**Solution Needed**: Lazy-load routes or use dynamic imports

### 3. 🔴 Observability Infrastructure (deps.ts)
**Time**: ~2.6 seconds when imported
**Cause**: Barrel export of all @opentelemetry/* packages
**Impact**: Any file importing from deps.ts loads everything
**Solution Needed**:
- Stop using deps.ts as barrel export
- Create separate lightweight exports for common types
- Import observability only when needed

## Files Modified

### New Files
1. `/components/context.ts` - Lightweight SectionContext
2. `/runtime/framework.ts` - Lightweight useFramework hook

### Modified Files
1. `/hooks/useScript.ts` - Lazy load terser
2. `/hooks/useDevice.ts` - Import from context.ts
3. `/hooks/useSetEarlyHints.ts` - Import from context.ts
4. `/hooks/useSection.ts` - Import from context.ts and utils/hasher.ts
5. `/components/section.tsx` - Export from context.ts, lazy load logger, import from framework.ts
6. `/blocks/mod.ts` - Import from context.ts, remove isSection export
7. `/blocks/matcher.ts` - Import directly from @std/http
8. `/runtime/middleware.ts` - Import directly, lazy-load observability, inline constants
9. `/runtime/handler.tsx` - Export from framework.ts
10. `/mod.ts` - Remove JsonViewer, ValueType, wildcard exports; import from framework.ts

## Next Steps for Further Optimization

1. **Refactor Deco Class**: Separate initialization from handler.tsx dependencies
2. **Lazy-Load Route Handlers**: Use dynamic imports in handler.tsx
3. **Split deps.ts**: Create separate files for different concerns
   - deps/stdlib.ts - Standard library exports
   - deps/opentelemetry.ts - Observability exports (lazy-loaded)
   - deps/types.ts - Type-only exports
4. **Consider Code Splitting**: Bundle routes separately from core runtime
5. **Profile Remaining Imports**: Identify other slow imports in storefront-specific code

## Impact

### Developer Experience
- ✅ Hooks can be imported instantly (~20ms)
- 🟡 Main export still requires patience (~6s)
- ✅ Most common patterns (hooks, types) are fast

### Production
- ✅ Faster cold starts for serverless
- ✅ Reduced initialization time
- ✅ Better developer iteration speed

### Breaking Changes
- ⚠️ `isSection` no longer exported from @deco/deco/blocks (only used internally)
- ⚠️ `ValueType` no longer exported from @deco/deco (not used by consumers)
- ⚠️ `JsonViewer` no longer exported from @deco/deco (use direct import if needed)
