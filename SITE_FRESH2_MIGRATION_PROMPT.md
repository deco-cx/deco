# Fresh 2 Migration Prompt for Deco Sites

Use this prompt when migrating a deco site from Fresh 1.x to Fresh 2.

---

## Prompt

I need to migrate this deco site from Fresh 1.x to Fresh 2. Fresh 2 removed the Plugin API, so deco now uses a middleware pattern instead.

### Changes Required

#### 1. Update `deno.json` imports

Replace Fresh and preact imports:

```json
{
  "imports": {
    "fresh": "jsr:@fresh/core@^2.2.0",
    "fresh/": "jsr:@fresh/core@^2.2.0/",
    "$fresh/": "jsr:@fresh/core@^2.2.0/",
    "preact": "npm:preact@^10.27.0",
    "preact/": "npm:preact@^10.27.0/",
    "preact-render-to-string": "npm:preact-render-to-string@^6.5.11",
    "@preact/signals": "npm:@preact/signals@^2.2.1",
    "vite": "npm:vite@^6.0.0"
  }
}
```

Update deco/apps imports to use the `fresh2` branch:

```json
// Pick whichever pattern this site uses:
"deco/": "https://denopkg.com/deco-cx/deco@fresh2/"
"@deco/deco": "https://denopkg.com/deco-cx/deco@fresh2/mod.ts"
"apps/": "https://denopkg.com/deco-cx/apps@fresh2/"
```

Remove `@preact/signals-core` if present (bundled in signals v2).

#### 2. Update `deno.json` tasks

```json
{
  "tasks": {
    "dev": "deno run -A --env npm:vite",
    "build": "deno run -A npm:vite build",
    "preview": "deno serve -A _fresh/server.js",
    "check": "deno fmt && deno lint && deno check main.ts"
  }
}
```

#### 3. Delete old files

Delete these files (no longer needed):
- `dev.ts`
- `fresh.gen.ts`  
- `fresh.config.ts`

#### 4. Create `vite.config.ts`

```typescript
import { defineConfig } from "vite";
import { fresh } from "@fresh/plugin-vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    fresh(),
    tailwindcss(),
  ],
});
```

#### 5. Create `client.ts`

```typescript
// Import CSS files here for hot module reloading
import "./static/styles.css";
```

#### 6. Update `main.ts` - THIS IS THE KEY CHANGE

Fresh 2 removed the Plugin API. Replace the old plugin-based setup with the new middleware pattern:

**Before (Fresh 1.x with Plugin):**
```typescript
import plugins from "deco/plugins/fresh.ts";
// or
import decoPlugin from "deco/runtime/fresh/plugin.tsx";

// Plugin-based registration
```

**After (Fresh 2 with Middleware):**
```typescript
import { App, staticFiles } from "fresh";
import { decoMiddleware } from "deco/runtime/fresh/plugin.tsx";
import manifest from "./manifest.gen.ts";

const app = new App()
  .use(staticFiles())
  .use(await decoMiddleware({ manifest }));

if (import.meta.main) {
  app.listen();
}
```

#### 7. Create `islands/DispatchAsyncRender.tsx`

Fresh 2 auto-discovers islands from the `islands/` folder. Create this file to enable deco's lazy section loading:

```typescript
// Re-export deco's island for lazy section loading
export { default } from "deco/runtime/fresh/islands/DispatchAsyncRender.tsx";
export * from "deco/runtime/fresh/islands/DispatchAsyncRender.tsx";
```

#### 8. Update Fresh imports in components

Search and replace all Fresh imports:

```typescript
// Before
import { Head } from "$fresh/runtime.ts";
import { IS_BROWSER } from "$fresh/runtime.ts";

// After  
import { Head } from "fresh/runtime";
import { IS_BROWSER } from "fresh/runtime";
```

#### 9. Update error pages

If you have `_404.tsx` and `_500.tsx`, merge them into `_error.tsx`:

```typescript
import { HttpError, type PageProps } from "fresh";

export default function ErrorPage(props: PageProps) {
  const error = props.error;
  
  if (error instanceof HttpError && error.status === 404) {
    return <h1>404 - Page not found</h1>;
  }
  
  return <h1>Something went wrong</h1>;
}
```

### Summary of Key Changes

| Fresh 1.x | Fresh 2 |
|-----------|---------|
| `decoPlugin({ manifest })` | `await decoMiddleware({ manifest })` |
| Plugin API (`routes`, `middlewares`) | `app.use()` middleware pattern |
| `$fresh/runtime.ts` | `fresh/runtime` |
| `dev.ts` | `vite.config.ts` |
| `deno run -A dev.ts` | `deno run -A npm:vite` |

### Verification

After making these changes, run:

```bash
deno task dev
```

The Vite dev server should start without errors.
