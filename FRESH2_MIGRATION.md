# Fresh 2 Migration Guide for Deco Sites

Migrate your site from Fresh 1.x to Fresh 2 using Vite.

## 1. Update deno.json dependencies

Update the imports section with these versions. Find and replace the existing entries for Fresh, preact, deco, and apps:

```json
{
  "imports": {
    "fresh": "jsr:@fresh/core@^2.2.0",
    "fresh/": "jsr:@fresh/core@^2.2.0/",
    "$fresh/": "jsr:@fresh/core@^2.2.0/",
    "@fresh/plugin-tailwindcss": "jsr:@fresh/plugin-tailwindcss@^0.1.0",
    "preact": "npm:preact@^10.27.0",
    "preact-render-to-string": "npm:preact-render-to-string@^6.5.11",
    "@preact/signals": "npm:@preact/signals@^2.2.1",
    "vite": "npm:vite@^6.0.0"
  }
}
```

### Update deco and apps imports

Find your existing deco/apps imports and update them to point to the `fresh2` branch:

```json
// Common patterns - update whichever ones you have:

// If using "deco/" prefix:
"deco/": "https://denopkg.com/deco-cx/deco@fresh2/"

// If using "@deco/deco":
"@deco/deco": "https://denopkg.com/deco-cx/deco@fresh2/mod.ts"

// If using "apps/" prefix:
"apps/": "https://denopkg.com/deco-cx/apps@fresh2/"

// If using "deco-sites/apps/":
"deco-sites/apps/": "https://denopkg.com/deco-cx/apps@fresh2/"
```

**Remove these old imports if present:**
- `@preact/signals-core` (bundled in signals v2)
- Any `https://esm.sh/*@preact/signals@1.x` references
- Old CDN references to fresh like `https://cdn.jsdelivr.net/gh/denoland/fresh@1.x/`

## 2. Update deno.json tasks

Replace the tasks section:

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

## 3. Delete old files

Delete these files (no longer needed in Fresh 2):
- `dev.ts`
- `fresh.gen.ts`
- `fresh.config.ts`

## 4. Create vite.config.ts

Create `vite.config.ts` in the project root:

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

If not using Tailwind, remove the tailwindcss import and plugin.

## 5. Create client.ts

Create `client.ts` in the project root for client-side entry:

```typescript
// Import CSS files here for hot module reloading to work.
import "./static/styles.css";

// If using Tailwind with a separate CSS file:
// import "./styles/tailwind.css";
```

## 6. Update main.ts

Update `main.ts` to use the new Fresh 2 App pattern:

```typescript
import { App, staticFiles, trailingSlashes } from "fresh";

export const app = new App()
  .use(staticFiles())
  .use(trailingSlashes("never"))
  .fsRoutes();

// For production, the server entry is generated at _fresh/server.js
if (import.meta.main) {
  app.listen();
}
```

If using deco plugin, update to:

```typescript
import { App, staticFiles } from "fresh";
import { plugins } from "deco/plugins/deco.ts";

// Deco integration handles routing
export const app = new App()
  .use(staticFiles());

// Register deco plugin
for (const plugin of plugins({ manifest })) {
  app.use(plugin);
}

if (import.meta.main) {
  app.listen();
}
```

## 7. Update Fresh imports in components

Search and replace all Fresh imports:

```typescript
// Before
import { Head } from "$fresh/runtime.ts";
import { IS_BROWSER } from "$fresh/runtime.ts";
import { Head, IS_BROWSER } from "$fresh/runtime.ts";

// After
import { Head } from "fresh/runtime";
import { IS_BROWSER } from "fresh/runtime";
import { Head, IS_BROWSER } from "fresh/runtime";
```

## 8. Update error pages (if applicable)

If you have `_404.tsx` and `_500.tsx`, merge them into `_error.tsx`:

```typescript
import { HttpError, type PageProps } from "fresh";

export default function ErrorPage(props: PageProps) {
  const error = props.error;
  
  if (error instanceof HttpError) {
    if (error.status === 404) {
      return <h1>404 - Page not found</h1>;
    }
  }
  
  return <h1>Something went wrong</h1>;
}
```

## 9. Verify the migration

Run these commands to verify:

```bash
# Development server (should start Vite dev server)
deno task dev

# Build for production
deno task build

# Preview production build
deno task preview
```

## Summary of changes

| Before (Fresh 1.x) | After (Fresh 2) |
|-------------------|-----------------|
| `dev.ts` | `vite.config.ts` |
| `fresh.config.ts` | Config in `main.ts` via `new App()` |
| `fresh.gen.ts` | Auto-generated, not committed |
| `deno run -A dev.ts` | `deno run -A npm:vite` (dev) |
| `deno run -A main.ts` | `deno serve -A _fresh/server.js` (prod) |
| `$fresh/runtime.ts` | `fresh/runtime` |
| `$fresh/server.ts` | `fresh` |
| `_404.tsx` + `_500.tsx` | `_error.tsx` |

## Dependency versions reference

These are the versions used by Fresh 2.2.0:

| Package | Version |
|---------|---------|
| `@fresh/core` | `^2.2.0` |
| `preact` | `^10.27.0` |
| `preact-render-to-string` | `^6.5.11` |
| `@preact/signals` | `^2.2.1` |
| `vite` | `^6.0.0` |
| `@deco/deco` | `fresh2` branch (or `^2.0.0` when released) |
| `deco-sites/apps` | `fresh2` branch (or `^1.0.0` when released) |
