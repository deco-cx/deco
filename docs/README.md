# Documentação Completa do Deco

Esta é a documentação detalhada do framework deco, um CMS Visual baseado em Git
para aplicações Deno, utilizando uma arquitetura de blocos composáveis.

## Visão Geral

O **deco** é um framework moderno que permite criar aplicações web com:

- **Blocks composáveis**: Funções serializáveis que podem ser compostas
  visualmente
- **CMS Visual**: Interface visual para edição de conteúdo e configuração
- **Git-based**: Todas as mudanças são salvas no Git
- **Multi-framework**: Suporte ao Fresh, HTMX e outros frameworks
- **TypeScript-first**: Tipagem forte e geração automática de schemas

## Documentação por Diretório

### 🧩 [Blocks](./blocks.md)

Sistema de blocos composáveis que é o núcleo do framework deco.

**Principais funcionalidades:**

- Loaders para carregamento de dados
- Actions para mutações
- Sections para componentes JSX
- Handlers para rotas HTTP
- Workflows duráveis
- Matchers para segmentação
- Feature flags

### ⚙️ [Engine](./engine.md)

Engine de resolução de configurações inspirado no GraphQL.

**Principais funcionalidades:**

- Config Resolver Engine
- Decofile management
- Schema generation
- Manifest building
- Import map management
- Topological sorting
- Paralelização de resolução

### 🚀 [Runtime](./runtime.md)

Runtime HTTP baseado em Hono com suporte a múltiplos frameworks.

**Principais funcionalidades:**

- Servidor HTTP com Hono
- Sistema de middleware
- Cache em múltiplas camadas
- Suporte Fresh e HTMX
- Invoke system
- Renderização de páginas
- Observabilidade integrada

### 🛠️ [Daemon](./daemon.md)

Daemon de desenvolvimento para ambiente local.

**Principais funcionalidades:**

- File watching
- Git integration
- Tunnel support
- Process management
- Real-time APIs
- Meta management
- Logging system

### 🔧 [Commons](./commons.md)

Utilitários e funcionalidades compartilhadas.

**Principais funcionalidades:**

- Sistema JWT completo
- Workflows duráveis
- Inicialização comum
- Autoridades confiáveis

### 📊 [Observability](./observability.md)

Sistema de observabilidade baseado em OpenTelemetry.

**Principais funcionalidades:**

- Métricas automáticas
- Tracing distribuído
- Health probes
- Logging estruturado
- Instrumentação HTTP
- Samplers configuráveis

### 🔨 [Utils](./utils.md)

Utilitários diversos para todo o projeto.

**Principais funcionalidades:**

- HTTP utilities
- Device detection
- JSON manipulation
- Promise utilities
- Object utilities
- Cookie management
- Server timings

### 📜 [Scripts](./scripts.md)

Scripts de automação e ferramentas CLI.

**Principais funcionalidades:**

- Inicialização de projetos
- Bundling de aplicações
- Gerenciamento de releases
- Codemod transformations
- App management
- Development tools

### 🔌 [Outros Diretórios](./other-directories.md)

Clients, Components, Hooks e Plugins.

**Principais funcionalidades:**

- Clientes HTTP
- Componentes React/Preact
- Hooks customizados
- Plugins para frameworks

## Arquitetura Geral

```
deco/
├── blocks/         # 🧩 Sistema de blocos composáveis
├── engine/         # ⚙️ Engine de resolução
├── runtime/        # 🚀 Runtime HTTP e servidor
├── daemon/         # 🛠️ Daemon de desenvolvimento
├── commons/        # 🔧 Utilitários compartilhados
├── observability/  # 📊 Sistema de observabilidade
├── utils/          # 🔨 Utilitários diversos
├── scripts/        # 📜 Scripts de automação
├── clients/        # 🌐 Clientes HTTP
├── components/     # 🎨 Componentes UI
├── hooks/          # 🎣 Hooks React/Preact
└── plugins/        # 🔌 Plugins para frameworks
```

## Fluxo de Funcionamento

### 1. Desenvolvimento Local

```bash
# Criar novo projeto
deno run -A https://deco.cx/run init my-site

# Iniciar desenvolvimento
cd my-site
deno task start
```

### 2. Definindo Blocks

```typescript
// loaders/ProductLoader.ts
export interface Props {
  category: string;
}

export default function ProductLoader(props: Props, ctx: FnContext) {
  return fetch(`/api/products?category=${props.category}`)
    .then((res) => res.json());
}
```

### 3. Configurando no CMS

```json
{
  "loader-products": {
    "category": "electronics",
    "__resolveType": "./loaders/ProductLoader.ts"
  },
  "section-shelf": {
    "products": {
      "__resolveType": "loader-products"
    },
    "__resolveType": "./sections/ProductShelf.tsx"
  }
}
```

### 4. Renderização

O engine resolve a configuração e renderiza os componentes:

```
Configuration → Engine → Resolved Objects → Rendered Page
```

## Principais Conceitos

### Blocks

Funções serializáveis e composáveis:

- **Strongly typed**: Tipagem TypeScript completa
- **Composable**: Podem referenciar outros blocks
- **Serializable**: Podem ser salvos em JSON
- **Visual**: Editáveis através do CMS

### Resolvables

Objetos JSON com propriedade `__resolveType`:

- Apontam para um block ou outro resolvable
- Podem conter propriedades configuráveis
- São resolvidos pelo engine em runtime

### Manifest

Registro de todos os blocks da aplicação:

- Auto-gerado pelo sistema
- Permite descoberta de blocks
- Usado para routing e resolução

### Decofile

Arquivo de configuração da aplicação:

- Contém todos os resolvables
- Versionado no Git
- Editável visualmente

## Integrações

### E-commerce

- VTEX
- Shopify
- VNDA
- Linx
- Nuvemshop

### Frameworks

- Fresh
- HTMX
- React/Preact

### Hosting

- Deno Deploy
- Vercel
- Netlify
- deco.cx PRO

## Exemplo Completo

```typescript
// 1. Definir um loader
export default function ProductLoader(props: { category: string }) {
  return fetch(`/api/products?category=${props.category}`)
    .then(res => res.json());
}

// 2. Definir uma seção
export default function ProductShelf(props: { products: Product[] }) {
  return (
    <div>
      {props.products.map(product => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}

// 3. Configurar no .decofile.json
{
  "home-page": {
    "sections": [
      {
        "products": {
          "category": "featured",
          "__resolveType": "./loaders/ProductLoader.ts"
        },
        "__resolveType": "./sections/ProductShelf.tsx"
      }
    ],
    "__resolveType": "deco/blocks/Page.tsx"
  }
}
```

## Desenvolvimento

### Estrutura de Desenvolvimento

1. **Blocks**: Criar loaders, actions, sections
2. **Configuration**: Configurar através do CMS
3. **Testing**: Testar localmente com hot-reload
4. **Deploy**: Deploy automático via Git

### Boas Práticas

- Sempre tipar interfaces Props
- Usar cache appropriado para loaders
- Implementar error boundaries
- Seguir convenções de nomenclatura
- Documentar blocks complexos

## Recursos Adicionais

- [Site oficial](https://deco.cx)
- [Documentação oficial](https://deco.cx/docs)
- [Discord](https://deco.cx/discord)
- [GitHub](https://github.com/deco-cx/deco)

## Contribuindo

Para contribuir com o deco:

1. Fork o repositório
2. Crie uma branch para sua feature
3. Implemente suas mudanças
4. Adicione testes
5. Faça um pull request

## Licença

MIT License - veja o arquivo [LICENSE](../LICENSE) para detalhes.

---

Esta documentação cobre todos os aspectos principais do framework deco. Para
informações mais específicas, consulte a documentação individual de cada
diretório listada acima.
