# @deco/deco Node.js Compatibility Guide

## ✅ VALIDATED: Proof of Concept Complete

A working prototype was created in `demo-linkedin/` that successfully:
- Runs deco sections on Bun
- Implements admin-compatible APIs (`/deco/meta`, `/deco/invoke`)
- Renders complex sections with Image, Picture, Theme components
- Uses a minimal compat layer approach

### Key Lessons Learned

1. **Compat layer works** - Simple shims for `@deco/deco/hooks` and `apps/*` components enable sections to render on Bun
2. **Hono is portable** - Already runtime-agnostic, no changes needed
3. **Preact SSR is trivial** - Just configure JSX correctly in tsconfig
4. **Admin APIs are simple** - JSON endpoints that return manifest/schema info
5. **Path mappings in tsconfig** - Effective way to swap implementations without modifying source files

### Recommended Approach

Instead of modifying all 85+ files, create a **compat overlay**:

```json
// tsconfig.json paths
{
  "paths": {
    "@deco/deco": ["./compat/deco/index.ts"],
    "@deco/deco/hooks": ["./compat/deco/hooks.ts"],
    "apps/*": ["./compat/apps/*"]
  }
}
```

This allows existing code to work unchanged while providing Bun-compatible implementations.

---

## Agent Instructions

This guide enables an AI agent to make the `@deco/deco` framework runtime-agnostic. Follow tasks sequentially unless marked as parallelizable.

**Estimated Complexity**: ~150k tokens of code changes across 85 files (or ~20k tokens using compat overlay approach)

---

## Task 1: Create Runtime Compatibility Layer

### 1.1 Create Directory Structure

```bash
mkdir -p compat
```

Create these files in order:

### 1.2 Create `compat/types.ts`

```typescript
// compat/types.ts
export interface DecoEnv {
  get(key: string): string | undefined;
  has(key: string): boolean;
  set(key: string, value: string): void;
  toObject(): Record<string, string | undefined>;
}

export interface DecoFS {
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, content: string): Promise<void>;
  readDir(path: string): AsyncIterable<{ name: string; isFile: boolean; isDirectory: boolean }>;
  stat(path: string): Promise<{ isFile: boolean; isDirectory: boolean; mtime: Date | null; size: number }>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  remove(path: string, options?: { recursive?: boolean }): Promise<void>;
  realPath(path: string): Promise<string>;
}

export interface DecoProcess {
  cwd(): string;
  args(): string[];
  exit(code?: number): never;
  pid(): number;
}

export type Runtime = "deno" | "bun" | "node";
```

### 1.3 Create `compat/detect.ts`

```typescript
// compat/detect.ts
import type { Runtime } from "./types.ts";

declare const Deno: unknown;
declare const Bun: unknown;

export const isDeno = typeof Deno !== "undefined";
export const isBun = typeof Bun !== "undefined" && !isDeno;
export const isNode = !isDeno && !isBun && typeof process !== "undefined";

export const runtime: Runtime = isDeno ? "deno" : isBun ? "bun" : "node";
```

### 1.4 Create `compat/env.ts`

```typescript
// compat/env.ts
import type { DecoEnv } from "./types.ts";
import { isDeno } from "./detect.ts";

// Deno types for compile-time safety
declare const Deno: {
  env: {
    get(key: string): string | undefined;
    has(key: string): boolean;
    set(key: string, value: string): void;
    toObject(): Record<string, string>;
  };
};

const denoEnv: DecoEnv = {
  get: (key) => Deno.env.get(key),
  has: (key) => Deno.env.has(key),
  set: (key, value) => Deno.env.set(key, value),
  toObject: () => Deno.env.toObject(),
};

const nodeEnv: DecoEnv = {
  get: (key) => process.env[key],
  has: (key) => key in process.env && process.env[key] !== undefined,
  set: (key, value) => { process.env[key] = value; },
  toObject: () => ({ ...process.env }) as Record<string, string | undefined>,
};

export const env: DecoEnv = isDeno ? denoEnv : nodeEnv;
```

### 1.5 Create `compat/process.ts`

```typescript
// compat/process.ts
import type { DecoProcess } from "./types.ts";
import { isDeno } from "./detect.ts";

declare const Deno: {
  cwd(): string;
  args: string[];
  exit(code?: number): never;
  pid: number;
};

const denoProcess: DecoProcess = {
  cwd: () => Deno.cwd(),
  args: () => Deno.args,
  exit: (code) => Deno.exit(code),
  pid: () => Deno.pid,
};

const nodeProcess: DecoProcess = {
  cwd: () => process.cwd(),
  args: () => process.argv.slice(2),
  exit: (code) => process.exit(code),
  pid: () => process.pid,
};

export const proc: DecoProcess = isDeno ? denoProcess : nodeProcess;
```

### 1.6 Create `compat/fs.ts`

```typescript
// compat/fs.ts
import type { DecoFS } from "./types.ts";
import { isDeno } from "./detect.ts";

declare const Deno: {
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, content: string): Promise<void>;
  readDir(path: string): AsyncIterable<{ name: string; isFile: boolean; isDirectory: boolean }>;
  stat(path: string): Promise<{ isFile: boolean; isDirectory: boolean; mtime: Date | null; size: number }>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  remove(path: string, options?: { recursive?: boolean }): Promise<void>;
  realPath(path: string): Promise<string>;
};

const denoFS: DecoFS = {
  readTextFile: (path) => Deno.readTextFile(path),
  writeTextFile: (path, content) => Deno.writeTextFile(path, content),
  readDir: (path) => Deno.readDir(path),
  stat: async (path) => {
    const stat = await Deno.stat(path);
    return { isFile: stat.isFile, isDirectory: stat.isDirectory, mtime: stat.mtime, size: stat.size };
  },
  exists: async (path) => {
    try {
      await Deno.stat(path);
      return true;
    } catch {
      return false;
    }
  },
  mkdir: (path, opts) => Deno.mkdir(path, opts),
  remove: (path, opts) => Deno.remove(path, opts),
  realPath: (path) => Deno.realPath(path),
};

// Lazy import for Node.js to avoid loading when running on Deno
let nodeFS: DecoFS | null = null;

const getNodeFS = async (): Promise<DecoFS> => {
  if (nodeFS) return nodeFS;
  
  const fsPromises = await import("node:fs/promises");
  const { existsSync } = await import("node:fs");
  const { realpath } = fsPromises;
  
  nodeFS = {
    readTextFile: (path) => fsPromises.readFile(path, "utf-8"),
    writeTextFile: (path, content) => fsPromises.writeFile(path, content, "utf-8"),
    readDir: async function* (path) {
      const entries = await fsPromises.readdir(path, { withFileTypes: true });
      for (const entry of entries) {
        yield {
          name: entry.name,
          isFile: entry.isFile(),
          isDirectory: entry.isDirectory(),
        };
      }
    },
    stat: async (path) => {
      const stat = await fsPromises.stat(path);
      return {
        isFile: stat.isFile(),
        isDirectory: stat.isDirectory(),
        mtime: stat.mtime,
        size: stat.size,
      };
    },
    exists: async (path) => existsSync(path),
    mkdir: (path, opts) => fsPromises.mkdir(path, opts),
    remove: (path, opts) => fsPromises.rm(path, opts),
    realPath: (path) => realpath(path),
  };
  
  return nodeFS;
};

// Export a proxy that lazily initializes Node.js fs
export const fs: DecoFS = isDeno
  ? denoFS
  : new Proxy({} as DecoFS, {
      get: (_, prop: keyof DecoFS) => {
        return async (...args: unknown[]) => {
          const nodeFs = await getNodeFS();
          // @ts-expect-error dynamic call
          return nodeFs[prop](...args);
        };
      },
    });
```

### 1.7 Create `compat/inspect.ts`

```typescript
// compat/inspect.ts
import { isDeno } from "./detect.ts";

declare const Deno: {
  inspect(value: unknown, options?: { depth?: number; colors?: boolean }): string;
};

export const inspect = (value: unknown, options?: { depth?: number; colors?: boolean }): string => {
  if (isDeno) {
    return Deno.inspect(value, options);
  }
  
  // Node.js / Bun
  try {
    const util = require("node:util");
    return util.inspect(value, {
      depth: options?.depth ?? 4,
      colors: options?.colors ?? true,
    });
  } catch {
    // Fallback for environments without util
    return JSON.stringify(value, null, 2);
  }
};
```

### 1.8 Create `compat/crypto.ts`

```typescript
// compat/crypto.ts
import { isDeno } from "./detect.ts";

// Use Web Crypto API which is available in all runtimes
export const cryptoRandomUUID = (): string => {
  return crypto.randomUUID();
};

export const cryptoGetRandomValues = <T extends ArrayBufferView>(array: T): T => {
  return crypto.getRandomValues(array);
};

// For subtle crypto operations, use the standard Web Crypto API
export const subtle = crypto.subtle;
```

### 1.9 Create `compat/serve.ts`

```typescript
// compat/serve.ts
import { isDeno, isBun } from "./detect.ts";

export interface ServeOptions {
  port: number;
  hostname?: string;
  onListen?: (addr: { hostname: string; port: number }) => void;
}

export type Handler = (request: Request) => Response | Promise<Response>;

declare const Deno: {
  serve(options: { port: number; hostname?: string; onListen?: (addr: { hostname: string; port: number }) => void }, handler: Handler): { shutdown(): Promise<void> };
};

declare const Bun: {
  serve(options: { port: number; hostname?: string; fetch: Handler }): { stop(): void };
};

export const serve = async (
  handler: Handler,
  options: ServeOptions
): Promise<{ shutdown: () => Promise<void> }> => {
  if (isDeno) {
    const server = Deno.serve({
      port: options.port,
      hostname: options.hostname,
      onListen: options.onListen,
    }, handler);
    return { shutdown: () => server.shutdown() };
  }
  
  if (isBun) {
    const server = Bun.serve({
      port: options.port,
      hostname: options.hostname,
      fetch: handler,
    });
    options.onListen?.({ hostname: options.hostname ?? "localhost", port: options.port });
    return { shutdown: async () => server.stop() };
  }
  
  // Node.js - use built-in http server with fetch adapter
  const { createServer } = await import("node:http");
  
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const url = `http://${req.headers.host}${req.url}`;
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
      }
      
      const body = req.method !== "GET" && req.method !== "HEAD"
        ? await new Promise<Buffer>((resolve) => {
            const chunks: Buffer[] = [];
            req.on("data", (chunk) => chunks.push(chunk));
            req.on("end", () => resolve(Buffer.concat(chunks)));
          })
        : undefined;
      
      const request = new Request(url, {
        method: req.method,
        headers,
        body,
      });
      
      const response = await handler(request);
      
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      
      const responseBody = await response.arrayBuffer();
      res.end(Buffer.from(responseBody));
    });
    
    server.listen(options.port, options.hostname ?? "0.0.0.0", () => {
      options.onListen?.({ hostname: options.hostname ?? "localhost", port: options.port });
      resolve({
        shutdown: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
};
```

### 1.10 Create `compat/mod.ts`

```typescript
// compat/mod.ts
export * from "./types.ts";
export * from "./detect.ts";
export * from "./env.ts";
export * from "./process.ts";
export * from "./fs.ts";
export * from "./inspect.ts";
export * from "./crypto.ts";
export * from "./serve.ts";
```

---

## Task 2: Migrate Core Runtime Files

### 2.1 Update `runtime/mod.ts`

**Current code** (line 85):
```typescript
const manifest = await import(
  toFileUrl(join(Deno.cwd(), "manifest.gen.ts")).href
).then((mod) => mod.default);
```

**Replace with**:
```typescript
import { proc } from "../compat/mod.ts";
import { pathToFileURL } from "node:url";

const manifestPath = join(proc.cwd(), "manifest.gen.ts");
const manifest = await import(pathToFileURL(manifestPath).href).then((mod) => mod.default);
```

**⚠️ PITFALL**: `pathToFileURL` is from `node:url` but works in Deno too. However, for true portability, create a helper:

```typescript
// compat/url.ts
import { isDeno } from "./detect.ts";

export const toFileURL = (path: string): URL => {
  if (isDeno) {
    // Deno has toFileUrl in @std/path
    return new URL(`file://${path.startsWith("/") ? "" : "/"}${path}`);
  }
  const { pathToFileURL } = require("node:url");
  return pathToFileURL(path);
};
```

### 2.2 Update `deco.ts`

Search for all `Deno.` occurrences and replace:

```typescript
// Before
const siteId = Deno.env.get("DECO_SITE_ID");

// After
import { env } from "./compat/mod.ts";
const siteId = env.get("DECO_SITE_ID");
```

### 2.3 Update `deps.ts`

The deps.ts file re-exports many modules. For runtime compatibility:

```typescript
// deps.ts - Add at the top
import { isDeno } from "./compat/detect.ts";

// For Deno-specific exports, use conditional exports
export type Handler = (req: Request) => Response | Promise<Response>;

// The OpenTelemetry packages already use npm: prefix, which works in both runtimes
// Just ensure the npm: prefix is removed for Node.js builds
```

---

## Task 3: Migrate Engine Files

### 3.1 Files to Update in `engine/`

| File | Deno APIs Used | Action |
|------|----------------|--------|
| `engine/decofile/provider.ts` | `Deno.cwd()`, `Deno.env` | Use compat |
| `engine/decofile/fsFolder.ts` | `Deno.readTextFile`, `Deno.readDir` | Use compat/fs |
| `engine/decofile/fs.ts` | `Deno.readTextFile`, `Deno.writeTextFile` | Use compat/fs |
| `engine/decofile/fetcher.ts` | `Deno.env` | Use compat/env |
| `engine/manifest/manifest.ts` | `Deno.cwd()`, `Deno.env` | Use compat |
| `engine/schema/parser.ts` | May use Deno AST | See special handling |

### 3.2 Example: `engine/decofile/provider.ts`

```typescript
// Before
const decofilePath = join(Deno.cwd(), ".deco", "decofile.json");
if (await Deno.stat(decofilePath).then(() => true).catch(() => false)) {
  const content = await Deno.readTextFile(decofilePath);
  // ...
}

// After
import { fs, proc } from "../../compat/mod.ts";
import { join } from "@std/path";

const decofilePath = join(proc.cwd(), ".deco", "decofile.json");
if (await fs.exists(decofilePath)) {
  const content = await fs.readTextFile(decofilePath);
  // ...
}
```

### 3.3 Schema Parser Special Handling

The schema parser may use Deno's TypeScript AST. Options:

**Option A**: Use `ts-morph` (works everywhere)
```typescript
// engine/schema/parser.ts
import { runtime } from "../../compat/mod.ts";

export const parseSchema = async (filePath: string) => {
  if (runtime === "deno") {
    // Use Deno's built-in TypeScript parser
    const { parseModule } = await import("https://deno.land/x/deno_ast/mod.ts");
    return parseModule(filePath);
  }
  
  // Node.js/Bun: use ts-morph
  const { Project } = await import("ts-morph");
  const project = new Project();
  return project.addSourceFileAtPath(filePath);
};
```

**Option B**: Use `@deco/deno-ast-wasm` (WASM-based, works everywhere)
```typescript
import { parseModule } from "@deco/deno-ast-wasm";
// This is runtime-agnostic as it's compiled to WASM
```

**⚠️ PITFALL**: If using ts-morph, add it to package.json as optional dependency:
```json
{
  "optionalDependencies": {
    "ts-morph": "^21.0.0"
  }
}
```

---

## Task 4: Migrate Caching Layer

### 4.1 `runtime/caches/fileSystem.ts`

```typescript
// Before
await Deno.writeTextFile(cachePath, JSON.stringify(data));
const cached = await Deno.readTextFile(cachePath);
const stat = await Deno.stat(cachePath);

// After
import { fs } from "../../compat/mod.ts";

await fs.writeTextFile(cachePath, JSON.stringify(data));
const cached = await fs.readTextFile(cachePath);
const stat = await fs.stat(cachePath);
```

### 4.2 `runtime/caches/lrucache.ts`

Check if it uses any Deno APIs. If using `Deno.env` for cache config:

```typescript
// Before
const maxSize = parseInt(Deno.env.get("CACHE_MAX_SIZE") ?? "1000");

// After
import { env } from "../../compat/mod.ts";
const maxSize = parseInt(env.get("CACHE_MAX_SIZE") ?? "1000");
```

---

## Task 5: Migrate Observability

### 5.1 OpenTelemetry Packages

The deps.ts already uses npm packages for OpenTelemetry:
```typescript
export { OTLPTraceExporter } from "npm:@opentelemetry/exporter-trace-otlp-proto@0.52.1";
```

**For Node.js compatibility**, remove `npm:` prefix in package.json:
```json
{
  "dependencies": {
    "@opentelemetry/exporter-trace-otlp-proto": "0.52.1",
    "@opentelemetry/sdk-trace-node": "1.25.1"
  }
}
```

### 5.2 `observability/otel/config.ts`

Check for Deno.env usage:
```typescript
// Before
const endpoint = Deno.env.get("OTEL_EXPORTER_OTLP_ENDPOINT");

// After
import { env } from "../../compat/mod.ts";
const endpoint = env.get("OTEL_EXPORTER_OTLP_ENDPOINT");
```

---

## Task 6: Migrate Daemon (Dev Server)

The daemon is heavily Deno-specific. **Strategy**: Create a parallel Node.js dev server.

### 6.1 Create `daemon/node/mod.ts`

```typescript
// daemon/node/mod.ts
import chokidar from "chokidar";
import { spawn } from "node:child_process";
import { WebSocketServer } from "ws";

export interface DevServerOptions {
  root: string;
  port: number;
  hmrPort: number;
}

export const startDevServer = async (options: DevServerOptions) => {
  const { root, port, hmrPort } = options;
  
  // Start file watcher
  const watcher = chokidar.watch(root, {
    ignored: [
      /node_modules/,
      /\.git/,
      /\.deco/,
      /dist/,
    ],
    persistent: true,
  });
  
  // HMR WebSocket server
  const wss = new WebSocketServer({ port: hmrPort });
  
  const broadcast = (data: unknown) => {
    wss.clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(JSON.stringify(data));
      }
    });
  };
  
  watcher.on("change", async (path) => {
    console.log(`[deco] File changed: ${path}`);
    broadcast({ type: "update", path });
  });
  
  // Start the main server
  const server = spawn("bun", ["run", "src/server/index.ts"], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "development" },
  });
  
  return {
    close: async () => {
      watcher.close();
      wss.close();
      server.kill();
    },
  };
};
```

### 6.2 Add Dependencies for Node.js Dev Server

```json
// package.json (new file for deco/)
{
  "name": "@deco/deco",
  "version": "1.132.1",
  "type": "module",
  "exports": {
    ".": {
      "deno": "./mod.ts",
      "default": "./mod.ts"
    },
    "./compat": "./compat/mod.ts"
  },
  "devDependencies": {
    "chokidar": "^3.6.0",
    "ws": "^8.16.0"
  }
}
```

---

## Task 7: Migrate Scripts

### 7.1 `scripts/dev.ts`

```typescript
// Before
const watcher = Deno.watchFs(["./"], { recursive: true });
for await (const event of watcher) {
  // handle events
}

// After (Node.js version)
import chokidar from "chokidar";

const watcher = chokidar.watch("./", { 
  ignored: /node_modules|\.git/,
  persistent: true,
});

watcher.on("all", (event, path) => {
  // handle events
});
```

### 7.2 `scripts/bundle.lib.ts`

If using `Deno.Command`:
```typescript
// Before
const cmd = new Deno.Command("esbuild", { args: [...] });
const output = await cmd.output();

// After
import { spawn } from "node:child_process";

const cmd = spawn("esbuild", [...args]);
const output = await new Promise((resolve, reject) => {
  let stdout = "";
  cmd.stdout.on("data", (data) => stdout += data);
  cmd.on("close", (code) => code === 0 ? resolve(stdout) : reject(code));
});
```

---

## Task 8: Create package.json for npm Publishing

```json
{
  "name": "@deco/deco",
  "version": "1.132.1",
  "type": "module",
  "main": "./mod.ts",
  "exports": {
    ".": {
      "types": "./mod.ts",
      "deno": "./mod.ts",
      "bun": "./mod.ts",
      "node": "./mod.ts",
      "default": "./mod.ts"
    },
    "./web": "./mod.web.ts",
    "./htmx": "./runtime/htmx/mod.ts",
    "./hooks": "./hooks/mod.ts",
    "./blocks": "./blocks/mod.ts",
    "./compat": "./compat/mod.ts",
    "./engine": "./engine/mod.ts"
  },
  "dependencies": {
    "@opentelemetry/api": "1.9.0",
    "@opentelemetry/exporter-trace-otlp-proto": "0.52.1",
    "@opentelemetry/sdk-trace-node": "1.25.1",
    "@opentelemetry/sdk-metrics": "1.25.1",
    "hono": "^4.5.4",
    "preact": "10.23.1",
    "preact-render-to-string": "6.4.2",
    "fast-json-patch": "^3.1.1"
  },
  "devDependencies": {
    "chokidar": "^3.6.0",
    "ws": "^8.16.0",
    "typescript": "^5.4.0"
  },
  "peerDependencies": {
    "ts-morph": "^21.0.0"
  },
  "peerDependenciesMeta": {
    "ts-morph": {
      "optional": true
    }
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

---

## Pitfalls & Common Mistakes

### ❌ PITFALL 1: Import Maps Don't Work in Node.js

**Wrong**:
```typescript
import { join } from "@std/path";  // Works in Deno with import map
```

**Right**:
```typescript
// Use conditional import or path alias in tsconfig.json
import { join } from "node:path";
```

**Solution**: Create path aliases in tsconfig.json:
```json
{
  "compilerOptions": {
    "paths": {
      "@std/path": ["./node_modules/@jsr/std__path/mod.ts"]
    }
  }
}
```

### ❌ PITFALL 2: `globalThis` vs `global` vs `window`

**Wrong**:
```typescript
globalThis.Deno = undefined;  // Breaks runtime detection
```

**Right**:
```typescript
// Never modify globalThis.Deno
// Instead, use the compat layer which handles detection
```

### ❌ PITFALL 3: Dynamic Imports with Variables

**Wrong** (won't work in bundlers):
```typescript
const modulePath = `./loaders/${name}.ts`;
const mod = await import(modulePath);
```

**Right**:
```typescript
// Use static imports or a manifest
import * as loader1 from "./loaders/loader1.ts";
import * as loader2 from "./loaders/loader2.ts";

const loaders = { loader1, loader2 };
const mod = loaders[name];
```

### ❌ PITFALL 4: `npm:` Prefix in Imports

**Wrong** (only works in Deno):
```typescript
import { somePackage } from "npm:some-package@1.0.0";
```

**Right**:
```typescript
// In deno.json, map the import
// In package.json, add as regular dependency
import { somePackage } from "some-package";
```

### ❌ PITFALL 5: Deno.test in Production Code

**Wrong**:
```typescript
// In a regular module
Deno.test("my test", () => { /* ... */ });
```

**Right**:
```typescript
// Keep tests in separate .test.ts files
// Use vitest for Node.js compatibility
```

---

## Verification Checklist

After completing all tasks, verify:

- [ ] `bun run compat/mod.ts` imports without errors
- [ ] `env.get("PATH")` returns a value on both runtimes
- [ ] `fs.readTextFile("./deno.json")` works on both runtimes
- [ ] `proc.cwd()` returns correct directory
- [ ] `inspect({ foo: "bar" })` produces readable output
- [ ] OpenTelemetry tracing initializes on Node.js
- [ ] Hono server starts on Node.js/Bun

---

## File Change Summary

| Directory | Files to Modify | New Files |
|-----------|----------------|-----------|
| `compat/` | 0 | 10 (all new) |
| `runtime/` | 15 | 0 |
| `engine/` | 12 | 0 |
| `daemon/` | 0 | 2 (node/ subdir) |
| `observability/` | 6 | 0 |
| `scripts/` | 14 | 0 |
| `utils/` | 10 | 0 |
| Root | 2 (deps.ts, deco.ts) | 1 (package.json) |

**Total**: ~60 files to modify, ~13 new files
