# Engine - Config Resolver Engine

O diretório `engine/` contém o engine principal do deco, responsável pela
resolução de configurações e execução de blocks de forma eficiente e otimizada.

## Visão Geral

O **Config Resolver Engine** é inspirado no GraphQL e otimizado para eficiência
usando topological sorting, garantindo que apenas as partes necessárias do
objeto sejam resolvidas.

## Arquitetura

```
engine/
├── core/                    # Engine principal de resolução
│   ├── README.md           # Documentação do core
│   ├── mod.ts              # Exportações principais
│   ├── resolver.ts         # Resolvers e contexto base
│   ├── utils.ts            # Utilitários do core
│   └── hints.ts            # Sistema de hints para otimização
├── decofile/               # Gerenciamento de arquivos de configuração
│   ├── provider.ts         # Providers de decofile
│   ├── fetcher.ts          # Fetching de decofiles
│   ├── fs.ts               # Provider de sistema de arquivos
│   ├── fsFolder.ts         # Provider de pasta
│   ├── realtime.ts         # Provider em tempo real
│   └── json.ts             # Utilitários JSON
├── manifest/               # Construção e gerenciamento de manifests
│   ├── manifest.ts         # Lógica principal do manifest
│   ├── manifestBuilder.ts  # Construtor de manifests
│   ├── manifestGen.ts      # Geração automática
│   ├── defaults.ts         # Valores padrão
│   ├── fresh.ts            # Integração com Fresh
│   └── utils.ts            # Utilitários de manifest
├── schema/                 # Geração e validação de schemas
│   ├── gen.ts              # Geração de schemas
│   ├── parser.ts           # Parser de TypeScript
│   ├── reader.ts           # Leitor de schemas
│   ├── lazy.ts             # Lazy loading de schemas
│   ├── builder.ts          # Construtor de schemas
│   ├── schemeable.ts       # Interface schemeable
│   └── utils.ts            # Utilitários de schema
├── importmap/              # Gerenciamento de mapas de importação
│   ├── mod.ts              # Exportações principais
│   ├── builder.ts          # Construtor de import maps
│   ├── jsr.ts              # Suporte JSR
│   └── _util.ts            # Utilitários internos
├── block.ts                # Definições de blocks
├── errors.ts               # Tipos de erro
├── integrity.ts            # Verificação de integridade
├── middleware.ts           # Middleware do engine
└── trustedAuthority.ts     # Autoridades confiáveis
```

## Core Engine (`core/`)

### Conceitos Principais

#### Resolvers

**Resolvers** são funções que recebem um contexto e uma entrada, produzindo uma
saída:

```typescript
export type AsyncResolver<T, TParent, TContext> = (
  parent: TParent,
  context: TContext,
) => Promise<Resolvable<T> | T>;

export type SyncResolver<T, TParent, TContext> = (
  parent: TParent,
  context: TContext,
) => Resolvable<T> | T;
```

#### Resolvables

**Resolvables** são objetos JSON com uma propriedade especial `__resolveType`:

```json
{
  "loader-category-homens": {
    "category": "Homens",
    "__resolveType": "./loaders/VTEXProductList.ts"
  },
  "page-homens": {
    "sections": [
      {
        "products": {
          "__resolveType": "loader-category-homens"
        },
        "__resolveType": "./sections/ProductShelf.tsx"
      }
    ],
    "__resolveType": "$live/pages/LivePage.tsx"
  }
}
```

#### Algoritmo de Resolução

1. Recupera o **Resolvable** do estado de configuração se um ID for fornecido
2. Valida a referência `__resolveType`
3. Se o valor é um tipo primitivo, o retorna
4. Resolve recursivamente objetos e arrays
5. Usa o valor resolvido como entrada para a função referenciada por
   `__resolveType`
6. Repete o algoritmo se o resultado for outro **Resolvable**

### Sistema de Hints (v1.15.1+)

O sistema de hints pré-calcula e cacheia quais campos devem ser resolvidos,
reduzindo computação desnecessária:

```typescript
export interface HintNode<T> {
  __resolveType: string;
  [key: string]: HintNode<unknown> | unknown;
}
```

### Paralelismo

O engine pode resolver propriedades no mesmo nível em paralelo:

```typescript
const resolveParallel = async (
  obj: Record<string, any>,
  context: BaseContext,
) => {
  const entries = Object.entries(obj);
  const resolvedEntries = await Promise.all(
    entries.map(async ([key, value]) => [key, await resolve(value, context)]),
  );
  return Object.fromEntries(resolvedEntries);
};
```

### ReleaseResolver

A classe principal que gerencia resolução:

```typescript
export class ReleaseResolver<TContext extends BaseContext = BaseContext> {
  constructor(options: {
    resolvers: ResolverMap<TContext>;
    release: DecofileProvider;
    danglingRecover?: DanglingRecover[];
  });

  async resolve<T>(
    typeOrResolvable: string | Resolvable<T>,
    context: Omit<TContext, keyof BaseContext>,
    options?: ResolveOptions,
  ): Promise<T>;
}
```

## Decofile Management (`decofile/`)

### Providers

O sistema suporta múltiplos providers de decofile:

#### FileSystem Provider

```typescript
export const newFsProvider = (
  filename: string = DECO_FILE_NAME,
  appName?: string,
): DecofileProvider => {
  // Implementação para arquivos locais
};
```

#### HTTP Provider

```typescript
const fetchFromHttp = async (url: string | URL): Promise<HttpContent> => {
  // Implementação para HTTP
};
```

#### Realtime Provider

```typescript
export const newRealtime = (
  provider: RealtimeDecofileProvider,
  backgroundUpdate?: boolean,
): DecofileProvider => {
  // Implementação para updates em tempo real
};
```

### Composição de Providers

```typescript
export const compose = (...providers: DecofileProvider[]): DecofileProvider => {
  return providers.reduce((acc, current) => ({
    state: async (options) => {
      const [accState, currentState] = await Promise.all([
        acc.state(options),
        current.state(options),
      ]);
      return { ...accState, ...currentState };
    },
    // ... outros métodos
  }));
};
```

## Manifest Management (`manifest/`)

### Manifest Builder

Constrói manifests de aplicação de forma programática:

```typescript
export interface ManifestBuilder<TManifest extends AppManifest = AppManifest> {
  addImports(imports: ImportClause): ManifestBuilder<TManifest>;
  addExportDefault(
    exportDefault: ExportDefaultClause,
  ): ManifestBuilder<TManifest>;
  addManifestValues(values: ManifestValueClause[]): ManifestBuilder<TManifest>;
  mergeWith(manifests: TManifest[]): ManifestBuilder<TManifest>;
  data: ManifestData;
}
```

### Context Management

```typescript
export const newContext = async <T extends AppManifest>(
  manifest: T,
  importMap?: ImportMap,
  release?: DecofileProvider,
  instanceId?: string,
  site?: string,
  namespace?: string,
  visibilityOverrides?: DecoContext<T>["visibilityOverrides"]
): Promise<DecoContext<T>>;
```

## Schema Generation (`schema/`)

### Geração Automática

O sistema gera schemas TypeScript automaticamente:

```typescript
export const genSchemasFromManifest = async (
  manifest: AppManifest,
  base: string,
  importMap: ImportMap,
): Promise<Schemas> => {
  // Gera schemas a partir do manifest
};
```

### Lazy Schema Loading

```typescript
export const lazySchemaFor = (ctx: DecoContext): LazySchema => {
  return {
    get value() {
      return generateSchema(ctx);
    },
    get revision() {
      return ctx.release!.revision();
    },
  };
};
```

### Parser TypeScript

```typescript
export const parseModule = async (
  specifier: string,
  loader: (specifier: string) => Promise<string | undefined>,
): Promise<Program | null> => {
  // Parse de módulos TypeScript
};
```

## Import Map Management (`importmap/`)

### Builder

```typescript
export const buildImportMap = (
  manifest: AppManifest,
  baseUrl?: string,
): ImportMap => {
  const imports: Record<string, string> = {};

  // Constrói import map a partir do manifest
  for (const [blockType, blocks] of Object.entries(manifest)) {
    for (const [key, moduleRef] of Object.entries(blocks || {})) {
      imports[`${blockType}/${key}`] = resolveModule(moduleRef);
    }
  }

  return { imports };
};
```

### JSR Support

```typescript
export const jsrLatest = async (pkg: string): Promise<string | null> => {
  try {
    const response = await fetch(`https://jsr.io/${pkg}/meta.json`);
    const meta = await response.json();
    return meta.latest;
  } catch {
    return null;
  }
};
```

## Error Handling

### Tipos de Erro

```typescript
export class DanglingReference extends Error {
  constructor(public ref: string) {
    super(`Dangling reference: ${ref}`);
  }
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
```

### Dangling Recovery

```typescript
export interface DanglingRecover {
  recoverable: (resolver: string) => boolean;
  recover: Resolver;
}
```

## Middleware System

```typescript
export type ResolverMiddleware<T, TProps, TContext> = (
  props: TProps,
  context: ResolverMiddlewareContext<TContext>,
) => Promise<T> | T;

export const compose = <T, TProps, TContext>(
  ...middlewares: ResolverMiddleware<T, TProps, TContext>[]
): ResolverMiddleware<T, TProps, TContext> => {
  return async (
    props: TProps,
    context: ResolverMiddlewareContext<TContext>,
  ) => {
    // Composição de middlewares
  };
};
```

## Trusted Authority

Sistema de segurança para validar autoridades confiáveis:

```typescript
export const assertAllowedAuthorityFor = (url: URL): void => {
  const allowedAuthorities = [
    "deco.cx",
    "deco.site",
    "localhost",
    "127.0.0.1",
  ];

  if (!allowedAuthorities.includes(url.hostname)) {
    throw new Error(`Untrusted authority: ${url.hostname}`);
  }
};
```

## Integrity Checks

```typescript
export const integrityCheck = async (manifest: AppManifest): Promise<void> => {
  // Verifica integridade do manifest
  for (const [blockType, blocks] of Object.entries(manifest)) {
    for (const [key, moduleRef] of Object.entries(blocks || {})) {
      await validateModule(moduleRef);
    }
  }
};
```

## Exemplo de Uso Completo

```typescript
// Criando um resolver
const resolver = new ReleaseResolver({
  resolvers: {
    "loader-products": async (props, ctx) => {
      return await fetchProducts(props.category);
    },
    "section-shelf": async (props, ctx) => {
      return <ProductShelf {...props} />;
    },
  },
  release: await getProvider(),
});

// Resolvendo uma configuração
const page = await resolver.resolve("page-home", {
  request: new Request("https://example.com"),
});
```

Este engine fornece a base para todo o sistema de resolução do deco, permitindo
composição eficiente e type-safe de blocos através de configurações JSON.
