# Blocks - Sistema de Blocos

O diretório `blocks/` é o núcleo do framework deco, implementando o sistema de
blocos que permite criar aplicações web composáveis e reutilizáveis.

## Visão Geral

Os **Blocks** são funções serializáveis que podem ser compostas para criar
aplicações web complexas. Eles são fortemente tipados e podem ser salvos em
banco de dados, permitindo composição visual através do CMS.

## Arquitetura

```
blocks/
├── README.md              # Documentação dos blocks
├── index.ts              # Registro central de todos os blocks
├── mod.ts                # Exportações principais
├── utils.tsx             # Utilitários compartilhados
├── appsUtil.ts           # Utilitários para aplicações
├── propsLoader.ts        # Carregamento de propriedades
├── app.ts                # Block de aplicação
├── loader.ts             # Block de carregamento de dados
├── action.ts             # Block de ações/mutações
├── section.ts            # Block de componentes JSX
├── handler.ts            # Block de handlers HTTP
├── workflow.ts           # Block de workflows duráveis
├── matcher.ts            # Block de regras de matching
├── flag.ts               # Block de feature flags
├── account.ts            # Block de contas/autenticação
├── function.ts           # Block de funções (legacy)
└── page.tsx              # Block de páginas
```

## Tipos de Blocks

### 1. Loader Block (`loader.ts`)

Responsável por carregar dados de fontes externas.

**Características:**

- Cache configurável (`no-store`, `stale-while-revalidate`, `no-cache`)
- Single-flight para evitar requisições duplicadas
- Tratamento de erros automatizado
- Suporte a observabilidade

**Exemplo de uso:**

```typescript
export interface Props {
  category: string;
}

export default function ProductLoader(props: Props, ctx: FnContext) {
  return fetch(`/api/products?category=${props.category}`)
    .then((res) => res.json());
}
```

### 2. Action Block (`action.ts`)

Executa mutações e operações que modificam estado.

**Características:**

- Controle de visibilidade (público/privado)
- Execução em contexto de requisição
- Suporte a preview automático

**Exemplo de uso:**

```typescript
export interface Props {
  name: string;
  email: string;
}

export default function CreateUser(props: Props, ctx: FnContext) {
  return fetch("/api/users", {
    method: "POST",
    body: JSON.stringify(props),
  });
}
```

### 3. Section Block (`section.ts`)

Componentes JSX que podem ser renderizados.

**Características:**

- Renderização de componentes React/Preact
- Suporte a partial rendering
- Context de seção para hooks
- Error boundaries automáticos

**Exemplo de uso:**

```typescript
export interface Props {
  title: string;
  products: Product[];
}

export default function ProductShelf(props: Props) {
  return (
    <div>
      <h2>{props.title}</h2>
      {props.products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
```

### 4. Handler Block (`handler.ts`)

Handlers HTTP para rotas específicas.

**Características:**

- Acesso completo ao Request/Response
- Integração com estado da aplicação
- Suporte a middlewares

### 5. Workflow Block (`workflow.ts`)

Workflows duráveis para operações de longa duração.

**Características:**

- Durabilidade através de @deco/durable
- Suporte a atividades locais
- Metadata para execução

### 6. Matcher Block (`matcher.ts`)

Regras de matching para segmentação.

**Características:**

- Matching baseado em contexto
- Suporte a sessões sticky
- Override via headers/query params

### 7. Flag Block (`flag.ts`)

Feature flags para controle de features.

**Características:**

- Flags simples (true/false)
- Flags multivariadas
- Regras de matching
- Valores diferidos

### 8. Account Block (`account.ts`)

Gerenciamento de contas e autenticação.

### 9. App Block (`app.ts`)

Define aplicações completas com manifests.

**Características:**

- Composição de múltiplos blocks
- Middleware customizado
- Import maps
- Resolvers

## Funcionalidades Principais

### Serialização

Blocks podem ser serializados em JSON, permitindo armazenamento em banco de
dados:

```json
{
  "loader-products": {
    "category": "electronics",
    "__resolveType": "./loaders/ProductLoader.ts"
  }
}
```

### Composição

Blocks podem referenciar outros blocks:

```json
{
  "section-shelf": {
    "title": "Produtos em Destaque",
    "products": {
      "__resolveType": "loader-products"
    },
    "__resolveType": "./sections/ProductShelf.tsx"
  }
}
```

### Type Safety

Todos os blocks são fortemente tipados:

```typescript
export interface Block<
  TBlockModule,
  TDefaultExportFunc,
  BType,
  TProvides,
  TSerializable,
> {
  type: BType;
  adapt?: (blockModule: TBlockModule, key: string) => Resolver;
  introspect?: IntrospectParams;
  defaultPreview?: Resolver<PreactComponent>;
  defaultInvoke?: Resolver;
}
```

### Middleware

Blocks suportam middleware para funcionalidades transversais:

```typescript
const middlewares = [
  gateKeeper(mod.defaultVisibility, key),
  wrapCaughtErrors,
  applyProps(mod),
];
```

## Manifest Generation

O sistema gera automaticamente um `manifest.gen.ts` que registra todos os
blocks:

```typescript
export default {
  loaders: {
    "ProductLoader": () => import("./loaders/ProductLoader.ts"),
  },
  sections: {
    "ProductShelf": () => import("./sections/ProductShelf.tsx"),
  },
};
```

## Cache System

Loaders suportam diferentes estratégias de cache:

- `no-store`: Sem cache
- `stale-while-revalidate`: Cache com revalidação em background
- `no-cache`: Cache com revalidação sempre

## Error Handling

Sistema unificado de tratamento de erros:

```typescript
const wrapCaughtErrors = (props, ctx) => {
  try {
    return await next(props, ctx);
  } catch (error) {
    return new Proxy(error, {
      get(target, prop) {
        if (prop === "__isErr") return true;
        if (prop === "then") return undefined;
        return target[prop];
      },
    });
  }
};
```

## Observabilidade

Blocks são automaticamente instrumentados para observabilidade:

- Métricas de performance
- Tracing distribuído
- Logs estruturados
- Health checks

## Integração com CMS

Os blocks são expostos no CMS visual através de schemas JSON gerados
automaticamente a partir dos tipos TypeScript, permitindo edição visual das
propriedades.

## Exemplo Completo

```typescript
// loaders/ProductLoader.ts
export interface Props {
  category: string;
  limit?: number;
}

export default async function ProductLoader(
  props: Props,
  ctx: FnContext,
): Promise<Product[]> {
  const url = new URL("/api/products", ctx.request.url);
  url.searchParams.set("category", props.category);
  if (props.limit) url.searchParams.set("limit", props.limit.toString());

  const response = await fetch(url.toString());
  return response.json();
}

// Cache configuration
export const cache = "stale-while-revalidate";
```

Esta arquitetura permite criar aplicações web altamente modulares, tipadas e
editáveis visualmente através do CMS do deco.
