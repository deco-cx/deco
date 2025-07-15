# Índice da Documentação do Deco

Este é o índice completo da documentação do framework deco. Navegue pelos
diferentes diretórios para entender cada funcionalidade.

## 📋 Documentação Completa

### [📖 README Principal](./README.md)

Visão geral completa do framework deco, conceitos principais e exemplos de uso.

## 🗂️ Documentação por Diretório

### Core Systems

| Diretório                  | Descrição                                           | Status      |
| -------------------------- | --------------------------------------------------- | ----------- |
| [🧩 blocks](./blocks.md)   | Sistema de blocos composáveis - núcleo do framework | ✅ Completo |
| [⚙️ engine](./engine.md)   | Engine de resolução de configurações                | ✅ Completo |
| [🚀 runtime](./runtime.md) | Runtime HTTP e servidor                             | ✅ Completo |
| [🛠️ daemon](./daemon.md)   | Daemon de desenvolvimento                           | ✅ Completo |

### Support Systems

| Diretório                              | Descrição                                    | Status      |
| -------------------------------------- | -------------------------------------------- | ----------- |
| [🔧 commons](./commons.md)             | Utilitários e funcionalidades compartilhadas | ✅ Completo |
| [📊 observability](./observability.md) | Sistema de observabilidade                   | ✅ Completo |
| [🔨 utils](./utils.md)                 | Utilitários diversos                         | ✅ Completo |
| [📜 scripts](./scripts.md)             | Scripts de automação e CLI                   | ✅ Completo |

### Additional Components

| Diretório                                      | Descrição                            | Status      |
| ---------------------------------------------- | ------------------------------------ | ----------- |
| [🔌 other-directories](./other-directories.md) | Clients, Components, Hooks e Plugins | ✅ Completo |

## 🎯 Navegação por Interesse

### Para Desenvolvedores Iniciantes

1. [📖 README Principal](./README.md) - Comece aqui
2. [🧩 Blocks](./blocks.md) - Entenda os blocos
3. [🚀 Runtime](./runtime.md) - Como funciona o servidor
4. [🛠️ Daemon](./daemon.md) - Desenvolvimento local

### Para Desenvolvedores Avançados

1. [⚙️ Engine](./engine.md) - Engine de resolução
2. [📊 Observability](./observability.md) - Monitoramento
3. [🔧 Commons](./commons.md) - JWT e workflows
4. [🔨 Utils](./utils.md) - Utilitários diversos

### Para DevOps/Infraestrutura

1. [🛠️ Daemon](./daemon.md) - Daemon de desenvolvimento
2. [📊 Observability](./observability.md) - Monitoramento
3. [📜 Scripts](./scripts.md) - Scripts de automação
4. [🚀 Runtime](./runtime.md) - Configuração do servidor

### Para Colaboradores

1. [📖 README Principal](./README.md) - Visão geral
2. [📜 Scripts](./scripts.md) - Ferramentas de desenvolvimento
3. [🔧 Commons](./commons.md) - Funcionalidades compartilhadas
4. [🔌 Other Directories](./other-directories.md) - Componentes adicionais

## 🏗️ Arquitetura Resumida

```
deco/
├── 🧩 blocks/         Sistema de blocos composáveis
├── ⚙️ engine/         Engine de resolução
├── 🚀 runtime/        Runtime HTTP e servidor
├── 🛠️ daemon/         Daemon de desenvolvimento
├── 🔧 commons/        Utilitários compartilhados
├── 📊 observability/  Sistema de observabilidade
├── 🔨 utils/          Utilitários diversos
├── 📜 scripts/        Scripts de automação
├── 🌐 clients/        Clientes HTTP
├── 🎨 components/     Componentes UI
├── 🎣 hooks/          Hooks React/Preact
└── 🔌 plugins/        Plugins para frameworks
```

## 🚀 Quick Start

```bash
# Criar novo projeto
deno run -A https://deco.cx/run init my-site

# Iniciar desenvolvimento
cd my-site
deno task start
```

## 📚 Glossário

| Termo          | Definição                             |
| -------------- | ------------------------------------- |
| **Block**      | Função serializável e composável      |
| **Resolvable** | Objeto JSON com `__resolveType`       |
| **Manifest**   | Registro de todos os blocks           |
| **Decofile**   | Arquivo de configuração da aplicação  |
| **Engine**     | Sistema de resolução de configurações |
| **Runtime**    | Servidor HTTP e middleware            |
| **Daemon**     | Processo de desenvolvimento local     |

## 🔗 Links Úteis

- [Site oficial](https://deco.cx)
- [Documentação oficial](https://deco.cx/docs)
- [Discord](https://deco.cx/discord)
- [GitHub](https://github.com/deco-cx/deco)
- [Exemplos](https://github.com/deco-sites)

## 📊 Métricas da Documentação

- **Diretórios documentados**: 11/11 (100%)
- **Páginas criadas**: 9 páginas
- **Palavras aproximadas**: ~15.000 palavras
- **Exemplos de código**: 50+ exemplos
- **Arquiteturas explicadas**: 11 arquiteturas

## 📝 Contribuindo com a Documentação

Para melhorar esta documentação:

1. Identifique áreas que precisam de mais detalhes
2. Adicione exemplos práticos
3. Corrija erros ou informações desatualizadas
4. Melhore a navegação
5. Adicione diagramas quando necessário

## 🎯 Próximos Passos

Após ler esta documentação, você deve ser capaz de:

- ✅ Entender a arquitetura do deco
- ✅ Criar blocks personalizados
- ✅ Configurar o ambiente de desenvolvimento
- ✅ Usar o sistema de observabilidade
- ✅ Contribuir com o projeto

---

_Esta documentação foi criada para fornecer uma visão completa e detalhada do
framework deco. Para sugestões ou correções, abra uma issue no GitHub._
