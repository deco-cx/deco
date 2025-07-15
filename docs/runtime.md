# Runtime - Servidor HTTP e Runtime

O diretório `runtime/` contém o runtime principal do deco, incluindo o servidor
HTTP baseado em Hono, sistema de middleware e funcionalidades de renderização.

## Visão Geral

O runtime do deco migrou do Fresh para o **Hono** como framework base,
proporcionando maior flexibilidade e performance. Suporta múltiplos frameworks
(Fresh, HTMX) através de um sistema de bindings.

## Arquitetura

```
runtime/
├── mod.ts                  # Classe principal Deco e configurações
├── handler.tsx             # Handler principal e roteamento
├── middleware.ts           # Sistema de middleware
├── deps.ts                 # Dependências do runtime
├── errors.ts               # Tipos de erro
├── utils.ts                # Utilitários do runtime
├── features/               # Funcionalidades específicas
│   ├── invoke.ts           # Sistema de invocação
│   ├── render.tsx          # Renderização de páginas
│   ├── preview.tsx         # Sistema de preview
│   ├── meta.ts             # Meta informações
│   └── styles.css.ts       # Estilos CSS/Tailwind
├── routes/                 # Handlers de rotas específicas
│   ├── entrypoint.tsx      # Ponto de entrada principal
│   ├── invoke.ts           # Rota de invocação
│   ├── blockPreview.tsx    # Preview de blocks
│   ├── previews.tsx        # Sistema de previews
│   ├── inspect.ts          # Inspeção de blocks
│   ├── render.tsx          # Renderização de seções
│   ├── release.ts          # Informações de release
│   ├── workflow.ts         # Execução de workflows
│   └── styles.css.ts       # Servir estilos
├── middlewares/            # Middlewares específicos
│   └── liveness.ts         # Health checks
├── caches/                 # Sistema de cache
│   ├── mod.ts              # Exportações principais
│   ├── common.ts           # Funcionalidades comuns
│   ├── compose.ts          # Composição de caches
│   ├── fileSystem.ts       # Cache de sistema de arquivos
│   ├── headerscache.ts     # Cache de headers
│   ├── lrucache.ts         # Cache LRU
│   ├── proxy.ts            # Cache proxy
│   ├── redis.ts            # Cache Redis
│   ├── tiered.ts           # Cache em camadas
│   └── utils.ts            # Utilitários de cache
├── fresh/                  # Suporte ao Fresh
│   ├── plugin.tsx          # Plugin do Fresh
│   ├── Bindings.tsx        # Bindings do Fresh
│   └── islands/            # Islands do Fresh
├── htmx/                   # Suporte ao HTMX
│   ├── mod.tsx             # Módulo principal HTMX
│   ├── Bindings.tsx        # Bindings do HTMX
│   ├── Renderer.tsx        # Renderizador HTMX
│   ├── serveStatic.ts      # Servidor de arquivos estáticos
│   └── fileCache.ts        # Cache de arquivos
└── fetch/                  # Utilitários de fetch
    ├── mod.ts              # Exportações principais
    ├── fetchCache.ts       # Cache de fetch
    └── fetchLog.ts         # Log de fetch
```

## Classe Principal Deco (`mod.ts`)

### Inicialização

```typescript
export class Deco<TAppManifest extends AppManifest = AppManifest> {
  static async init<TAppManifest extends AppManifest = AppManifest>(
    opts?: DecoOptions<TAppManifest>,
  ): Promise<Deco<TAppManifest>> {
    const site = opts?.site ?? siteNameFromEnv() ?? randomSiteName();
    const decofile = opts?.decofile ?? await getProvider();
    const manifest = opts?.manifest ?? await import("./manifest.gen.ts");

    const decoContext = await newContext(
      manifest,
      opts?.importMap,
      decofile,
      crypto.randomUUID(),
      site,
      opts?.namespace,
      opts?.visibilityOverrides,
    );

    Context.setDefault(decoContext);
    return new Deco(site, decoContext, opts?.bindings);
  }
}
```

### Opções de Configuração

```typescript
export interface DecoOptions<TAppManifest extends AppManifest = AppManifest> {
  site?: string;
  namespace?: string;
  importMap?: ImportMap;
  manifest?: TAppManifest;
  decofile?: DecofileProvider;
  bindings?: Bindings<TAppManifest>;
  visibilityOverrides?: DecoContext<TAppManifest>["visibilityOverrides"];
}
```

## Handler Principal (`handler.tsx`)

### Roteamento

O sistema de roteamento é baseado em um array de rotas que mapeia caminhos para
handlers:

```typescript
const routes: Array<{
  paths: string[];
  handler: DecoHandler<any>;
}> = [
  { paths: ["/styles.css"], handler: styles },
  { paths: ["/live/_meta", "/deco/meta"], handler: metaHandler },
  { paths: ["/live/release", "/.decofile"], handler: releaseHandler },
  {
    paths: ["/live/inspect/:block", "/deco/inspect/:block"],
    handler: inspectHandler,
  },
  { paths: ["/live/invoke", "/deco/invoke"], handler: invokeHandler },
  { paths: ["/live/previews", "/deco/previews"], handler: previewsHandler },
  { paths: ["/deco/render"], handler: renderHandler },
  { paths: ["/", "*"], handler: entrypoint },
];
```

### Bindings System

O sistema de bindings permite suporte a múltiplos frameworks:

```typescript
export interface Bindings<TAppManifest extends AppManifest = AppManifest> {
  framework?: Framework;
  renderer?: { renderFn: ContextRenderer };
  server?: Hono<DecoRouteState<TAppManifest>>;
  useServer?: (deco: Deco<TAppManifest>, hono: Hono) => void;
}
```

## Sistema de Middleware (`middleware.ts`)

### Middleware Principal

```typescript
export const middlewareFor = <TAppManifest extends AppManifest = AppManifest>(
  deco: Deco<TAppManifest>,
): DecoMiddleware<TAppManifest>[] => {
  return [
    // 0 => liveness
    liveness,
    // 1 => state builder
    async (ctx, next) => {
      const state = await deco.prepareState(ctx, { enabled, correlationId });
      for (const [key, value] of Object.entries(state)) {
        ctx.set(key as keyof typeof state, value);
      }
      await next();
    },
  ];
};
```

### State Management

```typescript
export interface State<
  TAppManifest extends AppManifest = AppManifest,
  TConfig = any,
> {
  deco: Deco<TAppManifest>;
  resolve: ResolveFunc;
  invoke: InvokeFunc;
  url: URL;
  response: { headers: Headers; status?: number };
  request: Request;
  site: { id: number; name: string };
  flags: string[];
  bag: WeakMap<any, any>;
  vary: VaryFunc;
  release: DecofileProvider;
  monitoring?: Monitoring;
  // ... outras propriedades
}
```

## Features (`features/`)

### Invoke System (`invoke.ts`)

Sistema para invocar blocks remotamente:

```typescript
export const invoke = async <T = any>(
  key: string,
  props: any,
  options: InvokeOptions<T> = {},
): Promise<T> => {
  const { select, ...invokeOptions } = options;

  const response = await fetch(`/deco/invoke/${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(props),
  });

  return response.json();
};
```

### Render System (`render.tsx`)

Sistema de renderização de páginas:

```typescript
export const render = async (
  req: Request,
  opts: Options,
  state: State,
): Promise<RenderResponse> => {
  const { component, props } = await state.resolve(opts.resolveChain);

  return {
    Component: component,
    props,
    metadata: {
      resolveChain: opts.resolveChain,
      component: opts.component,
    },
  };
};
```

### Preview System (`preview.tsx`)

Sistema para preview de components:

```typescript
export const preview = async (
  req: Request,
  previewUrl: string,
  props: unknown,
  state: State,
): Promise<PreactComponent> => {
  const resolved = await state.resolve(previewUrl, {
    props,
    resolveChain: [],
  });

  return resolved;
};
```

## Sistema de Cache (`caches/`)

### Cache Abstrato

```typescript
export interface Cache {
  get(key: string): Promise<Response | undefined>;
  set(key: string, response: Response): Promise<void>;
  delete(key: string): Promise<boolean>;
}
```

### Implementações

#### LRU Cache

```typescript
export class LRUCache implements Cache {
  private cache = new Map<string, { response: Response; timestamp: number }>();
  private maxSize: number;
  private ttl: number;

  constructor(maxSize = 100, ttl = 5 * 60 * 1000) {
    this.maxSize = maxSize;
    this.ttl = ttl;
  }
}
```

#### Redis Cache

```typescript
export class RedisCache implements Cache {
  private client: Redis;

  constructor(client: Redis) {
    this.client = client;
  }

  async get(key: string): Promise<Response | undefined> {
    const cached = await this.client.get(key);
    return cached ? new Response(cached) : undefined;
  }
}
```

#### Tiered Cache

```typescript
export class TieredCache implements Cache {
  private caches: Cache[];

  constructor(caches: Cache[]) {
    this.caches = caches;
  }

  async get(key: string): Promise<Response | undefined> {
    for (const cache of this.caches) {
      const result = await cache.get(key);
      if (result) return result;
    }
    return undefined;
  }
}
```

## Fresh Integration (`fresh/`)

### Plugin do Fresh

```typescript
export default function decoPlugin<TManifest extends AppManifest = AppManifest>(
  opt: Options<TManifest>,
): Plugin {
  const framework = opt?.htmx ? htmxFramework : freshFramework;

  const decoPromise = opt.deco instanceof Deco ? opt.deco : Deco.init({
    manifest: opt.manifest,
    site: opt?.site?.name,
    namespace: opt?.site?.namespace,
    bindings: {
      framework: {
        ...framework,
        ErrorFallback: opt.ErrorFallback ?? framework.ErrorFallback,
      },
      useServer: opt?.useServer,
    },
    visibilityOverrides: opt.visibilityOverrides,
  });

  return {
    name: "deco",
    middlewares: opt.middlewares,
    routes: [
      { path: "/[...catchall]", handler: createFreshHandler(decoPromise) },
      { path: "/index", handler: createFreshHandler(decoPromise) },
    ],
  };
}
```

## HTMX Integration (`htmx/`)

### Renderer HTMX

```typescript
export const renderFn: ContextRenderer = (data: PageData) => {
  const { Component, props } = data.page;

  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{data.page.metadata?.title}</title>
        <script src="https://unpkg.com/htmx.org@1.9.6"></script>
      </head>
      <body>
        <Component {...props} />
      </body>
    </html>
  );
};
```

### Static File Serving

```typescript
export const staticFiles = (options: StaticFileOptions = {}) => {
  return async (ctx: Context, next: Next) => {
    const url = new URL(ctx.req.url);

    if (url.pathname.startsWith("/static/")) {
      const filePath = join(options.root || "./static", url.pathname.slice(8));

      try {
        const file = await Deno.readFile(filePath);
        const mimeType = getContentType(filePath);

        return new Response(file, {
          headers: { "Content-Type": mimeType },
        });
      } catch {
        return new Response("Not Found", { status: 404 });
      }
    }

    await next();
  };
};
```

## Observabilidade

### Monitoring Integration

```typescript
export interface Monitoring {
  timings: ServerTimings;
  metrics: (name: string, value: number) => void;
  tracer: Tracer;
  context: Context;
  logger: Console;
}
```

### Server Timings

```typescript
export const createServerTimings = () => {
  const timings = new Map<string, number>();

  return {
    start: (name: string) => {
      timings.set(name, performance.now());
    },
    end: (name: string) => {
      const start = timings.get(name);
      if (start) {
        const duration = performance.now() - start;
        timings.set(name, duration);
      }
    },
    toHeaders: () => {
      const entries = Array.from(timings.entries())
        .map(([name, duration]) => `${name};dur=${duration.toFixed(2)}`)
        .join(", ");
      return { "Server-Timing": entries };
    },
  };
};
```

## Exemplo de Uso Completo

```typescript
// Inicializando o Deco
const deco = await Deco.init({
  site: "my-site",
  manifest: manifest,
  bindings: {
    framework: freshFramework,
    useServer: (deco, hono) => {
      // Configurações customizadas do servidor
      hono.get("/custom", (c) => c.text("Custom route"));
    },
  },
});

// Usando o handler
const response = await deco.handler(new Request("https://example.com/"));

// Invocando um block
const products = await deco.invoke("ProductLoader", {
  category: "electronics",
});

// Renderizando uma página
const page = await deco.render(
  new Request("https://example.com/"),
  { resolveChain: ["page-home"] },
);
```

O runtime do deco fornece uma base sólida e flexível para servir aplicações web
modernas, com suporte a múltiplos frameworks, caching inteligente e
observabilidade completa.
