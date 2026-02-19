# Startup Time Investigation Results

## Problem
Projects importing from `@deco/deco` experience ~7 second startup penalty.

## Findings

### ✅ Fixed Issues:

1. **hooks/useScript.ts - Terser loaded eagerly**
   - Before: 232ms
   - After: 0.05ms
   - Fix: Lazy-load terser in minify() function

2. **components/section.tsx - Observability logger loaded eagerly**
   - Before: useSetEarlyHints 246ms
   - After: useSetEarlyHints 4ms
   - Fix: Lazy-load logger in error handler

3. **hooks importing from section.tsx - Heavy component dependencies**
   - Before: useDevice 7057ms, usePartialSection 7089ms
   - After: useDevice 12ms, usePartialSection 13ms
   - Fix: Created components/context.ts with lightweight SectionContext

4. **hooks/useSection.ts - Importing from deps.ts**
   - Fix: Import MurmurHash3 directly from utils/hasher.ts

5. **blocks/matcher.ts - Importing from deps.ts**
   - Before: 2652ms
   - After: 32ms
   - Fix: Import getCookies/setCookie from @std/http directly

6. **runtime/middleware.ts - Importing from deps.ts**
   - Fix: Import getCookies/getSetCookies from @std/http directly
   - Fix: Lazy-load observability (startObserve, logger)
   - Fix: Inline SpanStatusCode values instead of importing

### 🔴 Remaining Issues:

1. **deps.ts as barrel export**
   - Problem: ANY import from deps.ts loads ALL OpenTelemetry packages (~2.6s)
   - Impact: Affects any file that imports from deps.ts
   - Solution needed: Stop using deps.ts as a barrel export for everything

2. **@deco/deco (mod.ts) - Still 7133ms**
   - JsonViewer removed (was 9176ms)
   - useFramework still exported (needed by apps package)
   - runtime/handler.tsx still slow (6267ms)
   - Need to investigate what else in mod.ts is slow

3. **blocks/page.tsx - 5927ms**
   - Imported by runtime/deps.ts
   - Imports from blocks/section.ts
   - Circular dependency issues

4. **runtime/handler.tsx - 6267ms**
   - Imports all route handlers
   - Imports from runtime/deps.ts → blocks/page.tsx
   - Used by section.tsx and exported from mod.ts

## Key Insight: The deps.ts Problem

**ANY import from `deps.ts` forces evaluation of the entire module, loading:**
- All @opentelemetry/* packages (~15 heavy npm modules)
- Takes ~2.6 seconds just to load deps.ts

**Solution:** Import directly from source packages:
```typescript
// ❌ BAD - Loads all OpenTelemetry
import { getCookies } from "../deps.ts";

// ✅ GOOD - Loads only what's needed
import { getCookies } from "@std/http";
```

## Test Results:

### Hooks Performance (after fixes):
| Hook | Before | After | Improvement |
|------|--------|-------|-------------|
| useDevice | 7057ms | 12ms | 588x faster |
| usePartialSection | 7089ms | 13ms | 545x faster |
| useScript | 232ms | 0.05ms | 4640x faster |
| useSetEarlyHints | 246ms | 1ms | 246x faster |

### Import from @deco/deco/hooks:
- Before: 6194ms
- After: 20-37ms
- **Improvement: ~200x faster!** ✅

### Import from @deco/deco (main):
- Before: 6284ms
- Current: 7133ms
- **Still needs work** 🔴

## Next Steps:

1. Investigate what mod.ts imports are still slow
2. Find alternative to deps.ts barrel exports
3. Optimize runtime/handler.tsx
4. Consider lazy-loading runtime dependencies

## Files Modified:
1. `/hooks/useScript.ts` - Lazy load terser
2. `/components/context.ts` - NEW lightweight context
3. `/components/section.tsx` - Use context.ts, lazy load logger
4. `/hooks/useDevice.ts` - Import from context.ts
5. `/hooks/useSetEarlyHints.ts` - Import from context.ts
6. `/hooks/useSection.ts` - Import from context.ts and utils/hasher.ts
7. `/blocks/matcher.ts` - Import directly from @std/http
8. `/runtime/middleware.ts` - Import directly, lazy-load observability
9. `/mod.ts` - Commented out JsonViewer export
