![imagem](https://github.com/deco-cx/deco/assets/1633518/ff2e1b28-8ab8-46cc-bbf2-727c620eda6f)

<hr/>

<a href="https://deno.land/x/deco" target="_blank"><img alt="Deno Land" src="https://img.shields.io/badge/denoland-deco-green" /></a>
&nbsp;
<a href="https://deco.cx/discord" target="_blank"><img alt="Discord" src="https://img.shields.io/discord/985687648595243068?label=Discord&color=7289da" /></a>
&nbsp;
<a href="https://x.com/deco_frontend" target="_blank"><img src="https://img.shields.io/twitter/follow/deco_frontend" alt="Twitter do Deco" /></a>
&nbsp;
![Status da Build](https://github.com/deco-cx/deco/workflows/ci/badge.svg?event=push&branch=main)

<hr/>

💻 **Deno Compose é uma IDE Visual Open-Source** para construir apps baseados em
Deno.

👁️ Transforma seu código **TypeScript em um editor visual sem código**,
diretamente na web.

⚡ Proporciona **visibilidade sobre o desempenho tanto na UI quanto na API,**
acelerando a criação de **sites de alta performance.**

⚙ Focado na **reutilização e composição** de componentes da UI (**Seções**) e
integrações de API (**Carregadores** e **Ações**).

📤 Seções, Carregadores e Ações podem ser **empacotados e instalados com um
clique como Apps.**

## Comece no nosso playground

Deno Compose combina o melhor da **edição visual de páginas** (como Webflow) com
a capacidade de **composição de apps no nível administrativo** (como Wordpress),
permitindo instalar e gerenciar novos recursos em poucos minutos, sem código.

Para começar a construir agora mesmo, acesse https://play.deco.cx e siga as
instruções para executar um projeto deco localmente.

Por exemplo, declarar um componente JSX ProductShelf com essas `Props`...

```typescript
import ProductCard, { Layout } from "$store/components/product/ProductCard.tsx";
import type { Product } from "apps/commerce/types.ts";

export interface Props {
  products: Product[] | null;
  title?: string;
  description?: string;
  layout?: {
    headerAlignment?: "center" | "left";
    headerfontSize?: "Normal" | "Large";
  };
  cardLayout?: Layout;
}

export default function ProductShelf(props: Props) {
  /** Seção JSX Preact + Tailwind UI **/
}
```

... irá gerar automaticamente esta UI de administração para você:

![CleanShot 2023-11-14 at 16 51 51](https://github.com/deco-cx/deco/assets/1633518/71f08873-8d62-42ec-9732-81dfa83f300c)

## Deploy em sua própria infraestrutura

O projeto deno criado com o Deno Compose é completamente independente — todas as
informações do CMS estão organizadas em um arquivo JSON junto com o código.

Isso significa que você pode deployar um projeto Deno Compose facilmente em
qualquer plataforma de hospedagem que desejar.

## Deploy na edge deco.cx - GRÁTIS para projetos pessoais

Você também pode fazer deploy de qualquer app Deno Compose em
[deco.cx](https://www.deco.cx/pt) — a infraestrutura gerenciada pelos autores
deste projeto.

**É grátis para sites ilimitados até 5.000 visualizações de página por mês!**

Com qualquer assinatura [deco.cx](https://www.deco.cx/pt), você também obtém:

- Infraestrutura edge gerenciada com implantação em 3 segundos
- Web Analytics gerenciado pelo Plausible
- Observabilidade gerenciada com rastreamento e registro de erros pelo HyperDX
- Acesso a **TODOS** os apps premium deco.hub
- Histórico de revisões infinitas para todas as mudanças no CMS
- Suporte a equipe com funções e permissões
- Suporte para convidados (permitindo que seus clientes editem seus sites).
- E um monte de outras funcionalidades que lançamos todo mês :)

## Por que usar Deno Compose?

Com **Deno Compose** você pode:

- Criar apps web modernos com um **editor de configuração visual** para
  gerenciar APIs, UIs e conteúdo — tudo no mesmo lugar.
- Compor recursos pré-construídos de um **ecossistema comunitário de Apps,** com
  instalação em um clique.
- Evoluir seus Apps com **flags de recursos em tempo real embutidos,**
  implementando código ou conteúdo para públicos específicos.

**Os Blocos do Deno Compose são interoperáveis:** a saída de um pode ser
configurada visualmente como entrada de outro no editor visual, **baseado em
tipos TypeScript correspondentes.**

Por exemplo, um componente de UI de Prateleira de Produtos pode depender de um
**`Product[]`.** Há muitas maneiras de obter um `Product[]`, como buscá-lo de
uma plataforma de e-commerce (como
[**Shopify**](https://github.com/deco-cx/apps/tree/main/shopify) ou
[**VTEX**](https://github.com/deco-cx/apps/tree/main/vtex)) ou de um provedor de
otimização de pesquisa (como
[**Algolia**](https://github.com/deco-cx/apps/tree/main/algolia) ou
[**Typesense**](https://github.com/deco-cx/apps/tree/main/typesense)).
deno-compose sugerirá automaticamente integrações correspondentes com base no
tipo definido de uma ampla gama de apps disponíveis, e o desenvolvedor pode
escolher a que melhor se adapta às suas necessidades. **Construir UIs agora pode
ser completamente abstraído de suas integrações de dados. Programe contra um
tipo conhecido, obtenha toneladas de integrações de primeira classe, prontas
para serem implantadas.**

Para experimentar nosso editor visual, navegue até o
[playground deco.cx](https://play.deco.cx), escolha um template e experimente
uma maneira simplificada, mas poderosa, de construir apps web.

![CleanShot 2023-11-14 at 20 55 32](https://github.com/deco-cx/deco/assets/1633518/e6f0d232-406d-4a20-8362-bd1cc8018b00)

> ⚠️ Hospedar o próprio editor está previsto para o início de 2024. Aguarde
> enquanto refatoramos alguns componentes internos antes de podermos convidar
> mais desenvolvedores para estendê-lo! Estamos ansiosos por isso.

## Principais Características

- Vocabulário Compartilhado: Defina o tipo que você precisa, e deno-compose
  auto-completa com múltiplas integrações correspondentes de uma comunidade
  global de apps. É TypeScript levado um passo adiante, transformando tipos em
  um vocabulário compartilhado que impulsiona suas integrações de UI e API.

- Implementações Pré-Construídas: Acelere seu desenvolvimento com Seções,
  Carregadores e Ações prontos para uso. Um tesouro de implementações
  pré-construídas espera ser descoberto e utilizado em seus projetos.

- Ecossistema Impulsionado pela Comunidade: Engaje-se com uma comunidade global
  de desenvolvedores no deco.hub. Compartilhe, descubra e colabore para
  enriquecer o vocabulário compartilhado em que o deno-compose prospera.

- Fluxo de Trabalho de Desenvolvimento Simplificado: Basta definir seus tipos e
  deixar o deno-compose cuidar do resto. Ele simplifica o fluxo de trabalho da
  definição de tipo para a renderização da UI e integração de API.

- Interoperável: deno-compose facilita a interação contínua entre diferentes
  apps e plataformas. Trata-se de quebrar silos e fomentar um ecossistema de
  desenvolvimento web mais interconectado.

## Motivação

Deno Compose visa simplificar radicalmente o desenvolvimento web — como era nos
anos 90, mas com todo o material moderno incluído. Propomos que isso começa
elevando TypeScript a um vocabulário global compartilhado de tipos que preenche
a lacuna entre interfaces e APIs. A simplicidade de definir um tipo e obter
auto-completações com múltiplas integrações correspondentes de uma comunidade de
apps deno-compose é um divisor de águas para a produtividade do desenvolvedor —
tanto humano quanto IA. É uma mudança em direção a um paradigma de
desenvolvimento web mais colaborativo e eficiente, onde o esforço coletivo da
comunidade se traduz em sucesso individual do projeto. Sem mais reinventar a
roda, sem mais silos, sem mais tempo desperdiçado. Apenas foco nas necessidades
do cliente, **obtendo os dados de onde você precisar,** quando precisar, e
**permitindo que todos na equipe criem e publiquem ótimo conteúdo** com esses
dados, de forma segura.

## Documentação

Explore as capacidades do deno-compose ainda mais em nossa documentação
abrangente. Aprenda como criar Seções, Carregadores, Apps e muito mais. Acesse
[https://deco.cx/docs](https://denocompose.dev/docs).

## Comunidade

Junte-se à comunidade no [Servidor Discord do deco](https://deco.cx/discord).
Compartilhe seus apps, explore as criações dos outros e contribua para o
vocabulário compartilhado que faz o deno-compose prosperar.

## Contribua

Convidamos contribuições! Seja corrigindo bugs, melhorando a documentação ou
propondo novos recursos, seus esforços são valiosos. Confira nossas diretrizes
de contribuição para começar.

## Agradecimentos a todos os contribuidores

<a href="https://github.com/deco-cx/deco/graphs/contributors">
  <img src="https://contributors-img.web.app/image?repo=deco-cx/deco" />
</a>
