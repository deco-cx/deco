# Compatibilidade Node.js - Guia de Migração

Este documento detalha a estratégia para tornar o deco compatível com Node.js,
mantendo a compatibilidade com Deno.

## Análise das APIs Específicas do Deno

### APIs Principais Identificadas

1. **Sistema de Arquivos**
   - `Deno.readTextFile()` / `Deno.writeTextFile()`
   - `Deno.readFile()` / `Deno.writeFile()`
   - `Deno.stat()` / `Deno.remove()`
   - `Deno.open()` / `Deno.watchFs()`

2. **Processo e Comando**
   - `Deno.Command` / `Deno.ChildProcess`
   - `Deno.execPath()` / `Deno.cwd()`
   - `Deno.env` / `Deno.args`
   - `Deno.exit()`

3. **Rede e HTTP**
   - `Deno.serve()`
   - `Deno.upgradeWebSocket()`
   - `Deno.createHttpClient()`
   - `Deno.HttpClient`

4. **Sistema e Permissões**
   - `Deno.permissions`
   - `Deno.build`
   - `Deno.memoryUsage()`
   - `Deno.addSignalListener()`

5. **Streams e I/O**
   - `Deno.stdout` / `Deno.stderr`
   - `Deno.stdin`
   - `ReadableStream` / `WritableStream`
   - `TextEncoder` / `TextDecoder`

## Estratégia de Compatibilidade

### 1. Criação de Camada de Compatibilidade

Criar um sistema de adaptadores que funcionem tanto no Deno quanto no Node.js:

```typescript
// compat/runtime.ts
export interface RuntimeAdapter {
  fs: FileSystemAdapter;
  process: ProcessAdapter;
  net: NetworkAdapter;
  system: SystemAdapter;
}

export const runtime: RuntimeAdapter = (() => {
  if (typeof Deno !== "undefined") {
    return createDenoAdapter();
  } else {
    return createNodeAdapter();
  }
})();
```

### 2. Adaptadores por Categoria

#### FileSystem Adapter

```typescript
// compat/fs.ts
export interface FileSystemAdapter {
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, content: string): Promise<void>;
  stat(path: string): Promise<StatInfo>;
  remove(path: string): Promise<void>;
  watchFs(
    path: string,
    options?: WatchOptions,
  ): AsyncIterableIterator<WatchEvent>;
}

// Implementação Deno
export const createDenoFsAdapter = (): FileSystemAdapter => ({
  readTextFile: Deno.readTextFile,
  writeTextFile: Deno.writeTextFile,
  stat: Deno.stat,
  remove: Deno.remove,
  watchFs: Deno.watchFs,
});

// Implementação Node.js
export const createNodeFsAdapter = (): FileSystemAdapter => ({
  readTextFile: (path: string) => require("fs").promises.readFile(path, "utf8"),
  writeTextFile: (path: string, content: string) =>
    require("fs").promises.writeFile(path, content, "utf8"),
  stat: require("fs").promises.stat,
  remove: require("fs").promises.unlink,
  watchFs: createNodeWatcher,
});
```

#### Process Adapter

```typescript
// compat/process.ts
export interface ProcessAdapter {
  execPath(): string;
  cwd(): string;
  env: Record<string, string | undefined>;
  args: string[];
  exit(code?: number): never;
  spawn(command: string, args: string[], options?: SpawnOptions): ChildProcess;
}

export const createNodeProcessAdapter = (): ProcessAdapter => ({
  execPath: () => process.execPath,
  cwd: () => process.cwd(),
  env: process.env,
  args: process.argv.slice(2),
  exit: (code) => process.exit(code),
  spawn: (command, args, options) => {
    const { spawn } = require("child_process");
    return spawn(command, args, options);
  },
});
```

#### Network Adapter

```typescript
// compat/net.ts
export interface NetworkAdapter {
  serve(options: ServeOptions, handler: Handler): Server;
  upgradeWebSocket(request: Request): WebSocketUpgrade;
  createHttpClient(options?: HttpClientOptions): HttpClient;
}

export const createNodeNetAdapter = (): NetworkAdapter => ({
  serve: (options, handler) => {
    const http = require("http");
    const server = http.createServer(async (req, res) => {
      const request = nodeRequestToWebRequest(req);
      const response = await handler(request);
      webResponseToNodeResponse(response, res);
    });
    server.listen(options.port, options.hostname);
    return server;
  },
  upgradeWebSocket: (request) => {
    const ws = require("ws");
    return new ws.WebSocketServer({ noServer: true });
  },
  createHttpClient: (options) => {
    const http = require("http");
    const https = require("https");
    return { http, https };
  },
});
```

### 3. Polyfills para Web APIs

```typescript
// compat/web-apis.ts
export const installWebApiPolyfills = () => {
  if (typeof globalThis.Request === "undefined") {
    const { Request } = require("node-fetch");
    globalThis.Request = Request;
  }

  if (typeof globalThis.Response === "undefined") {
    const { Response } = require("node-fetch");
    globalThis.Response = Response;
  }

  if (typeof globalThis.fetch === "undefined") {
    globalThis.fetch = require("node-fetch");
  }

  if (typeof globalThis.URL === "undefined") {
    globalThis.URL = require("url").URL;
  }

  if (typeof globalThis.URLSearchParams === "undefined") {
    globalThis.URLSearchParams = require("url").URLSearchParams;
  }

  if (typeof globalThis.ReadableStream === "undefined") {
    const { ReadableStream } = require("stream/web");
    globalThis.ReadableStream = ReadableStream;
  }

  if (typeof globalThis.WritableStream === "undefined") {
    const { WritableStream } = require("stream/web");
    globalThis.WritableStream = WritableStream;
  }

  if (typeof globalThis.TextEncoder === "undefined") {
    globalThis.TextEncoder = require("util").TextEncoder;
  }

  if (typeof globalThis.TextDecoder === "undefined") {
    globalThis.TextDecoder = require("util").TextDecoder;
  }

  if (typeof globalThis.crypto === "undefined") {
    globalThis.crypto = require("crypto").webcrypto;
  }

  if (typeof globalThis.performance === "undefined") {
    globalThis.performance = require("perf_hooks").performance;
  }
};
```

### 4. Atualização do Sistema de Módulos

#### Package.json para Node.js

```json
{
  "name": "@deco/deco",
  "version": "1.120.4",
  "type": "module",
  "main": "./dist/mod.js",
  "types": "./dist/mod.d.ts",
  "exports": {
    ".": {
      "node": "./dist/mod.js",
      "deno": "./mod.ts",
      "default": "./dist/mod.js"
    },
    "./web": {
      "node": "./dist/mod.web.js",
      "deno": "./mod.web.ts",
      "default": "./dist/mod.web.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.node.json",
    "build:deno": "deno task build",
    "test": "jest",
    "test:deno": "deno test"
  },
  "dependencies": {
    "node-fetch": "^3.3.2",
    "ws": "^8.14.2",
    "chokidar": "^3.5.3"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/ws": "^8.5.0",
    "typescript": "^5.0.0",
    "jest": "^29.0.0"
  }
}
```

#### TSConfig para Node.js

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "outDir": "./dist",
    "rootDir": "./",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "types": ["node"]
  },
  "include": [
    "**/*.ts",
    "**/*.tsx"
  ],
  "exclude": [
    "node_modules",
    "dist",
    "**/*.test.ts",
    "**/*.bench.ts"
  ]
}
```

### 5. Build System

#### Build Script

```typescript
// scripts/build-node.ts
import { build } from "esbuild";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";

const buildForNode = async () => {
  // Install polyfills
  const entryContent = `
import { installWebApiPolyfills } from './compat/web-apis.ts';
installWebApiPolyfills();

export * from './mod.ts';
`;

  await writeFile("node-entry.ts", entryContent);

  await build({
    entryPoints: ["node-entry.ts"],
    bundle: true,
    platform: "node",
    target: "node18",
    format: "esm",
    outfile: "dist/mod.js",
    external: ["node:*"],
    define: {
      "typeof Deno": '"undefined"',
    },
    plugins: [
      // Plugin para converter imports do Deno para Node.js
      {
        name: "deno-to-node",
        setup(build) {
          build.onResolve({ filter: /^@std\// }, (args) => {
            const mapping = {
              "@std/path": "path",
              "@std/fs": "fs",
              "@std/http": "http",
              // ... outros mappings
            };
            return { path: mapping[args.path] || args.path };
          });
        },
      },
    ],
  });
};

buildForNode().catch(console.error);
```

### 6. Refatoração do Código Base

#### Exemplo de Refatoração - FileSystem

```typescript
// Antes (específico do Deno)
const content = await Deno.readTextFile(filepath);
await Deno.writeTextFile(filepath, newContent);

// Depois (compatível com ambos)
import { runtime } from "./compat/runtime.ts";

const content = await runtime.fs.readTextFile(filepath);
await runtime.fs.writeTextFile(filepath, newContent);
```

#### Exemplo de Refatoração - Process

```typescript
// Antes
const cmd = new Deno.Command(Deno.execPath(), {
  args: ["run", "script.ts"],
  cwd: Deno.cwd(),
});

// Depois
import { runtime } from "./compat/runtime.ts";

const process = runtime.process.spawn(runtime.process.execPath(), [
  "run",
  "script.ts",
], {
  cwd: runtime.process.cwd(),
});
```

### 7. Testes

#### Configuração de Testes para Node.js

```typescript
// jest.config.js
export default {
  preset: "ts-jest/presets/default-esm",
  extensionsToTreatAsEsm: [".ts"],
  testEnvironment: "node",
  setupFilesAfterEnv: ["<rootDir>/test/setup.ts"],
  testMatch: ["**/*.test.ts"],
  transform: {
    "^.+\\.ts$": ["ts-jest", {
      useESM: true,
    }],
  },
};

// test/setup.ts
import { installWebApiPolyfills } from "../compat/web-apis.ts";
installWebApiPolyfills();
```

### 8. CI/CD Pipeline

#### GitHub Actions

```yaml
name: Cross-Runtime Tests

on: [push, pull_request]

jobs:
  test-deno:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: denoland/setup-deno@v1
        with:
          deno-version: v1.x
      - run: deno test --allow-all

  test-node:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: "18"
      - run: npm ci
      - run: npm run build
      - run: npm test

  cross-runtime-compatibility:
    runs-on: ubuntu-latest
    needs: [test-deno, test-node]
    steps:
      - run: echo "All tests passed!"
```

### 9. Documentação de Migração

#### Guia para Desenvolvedores

````markdown
# Migrando para Compatibilidade Node.js

## Importações

### Antes (Deno-only)

```typescript
import { serve } from "@std/http/server";
```
````

### Depois (Cross-runtime)

```typescript
import { runtime } from "@deco/deco/compat/runtime";
const server = runtime.net.serve(options, handler);
```

## APIs de Sistema

### Antes

```typescript
const content = await Deno.readTextFile("file.txt");
```

### Depois

```typescript
const content = await runtime.fs.readTextFile("file.txt");
```

## Detecção de Runtime

```typescript
import { isDenoRuntime, isNodeRuntime } from "@deco/deco/compat/runtime";

if (isDenoRuntime()) {
  // Lógica específica do Deno
} else if (isNodeRuntime()) {
  // Lógica específica do Node.js
}
```

### 10. Plano de Implementação

1. **Fase 1: Análise e Preparação**
   - Auditoria completa das APIs do Deno
   - Criação da camada de compatibilidade
   - Setup do build system

2. **Fase 2: Refatoração Core**
   - Migração dos módulos principais
   - Implementação dos adaptadores
   - Testes básicos

3. **Fase 3: Funcionalidades Específicas**
   - WebSocket support
   - File watching
   - Process management

4. **Fase 4: Testes e Validação**
   - Testes cross-runtime
   - Performance benchmarks
   - Documentação

5. **Fase 5: Release e Suporte**
   - Publicação npm
   - Documentação de migração
   - Suporte da comunidade

## Considerações Importantes

1. **Performance**: Algumas APIs podem ter performance diferentes entre runtimes
2. **Dependências**: Minimizar dependências externas para Node.js
3. **Compatibilidade**: Manter compatibilidade reversa com código existente
4. **Documentação**: Documentar diferenças e limitações
5. **Testes**: Garantir que tudo funciona em ambos os runtimes

Este plano fornece uma base sólida para tornar o deco compatível com Node.js
mantendo a funcionalidade completa em ambos os runtimes.
