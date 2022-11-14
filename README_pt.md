# deco live — the edge-native CMS

O _Live_ é um gerenciador de conteúdo (CMS) para aplicações web feitas com [Fresh](https://fresh.deno.dev), especializado para ecommerce. Com o _Live_ é possível criar e gerenciar páginas dinâmicas através do https://deco.cx.

_WIP:_ Para criar um site Live, acesse https://deco.cx e crie um novo projeto utilizando os templates disponíveis.

Acesse https://github.com/deco-sites/start e visualize um site de exemplo.

## Como desenvolver para o Live

Existem dois conceitos importantes para entender o _Live_:

### Seções

Seções são componentes _Preact_ que podem ser adicionados em páginas por usuários do CMS. Para criar uma seção, basta adicionar um novo arquivo na pasta `sections/` do site. Apenas arquivos **diretamente pertencentes** a este diretório serão imterpretados como seções.

Aqui um exemplo de uma seção `ProductShelf`:

```tsx
import { ProductList } from "$live/std/commerce/types/ProductList.ts";
import { ProductSummary } from "../components/ProductSummary.tsx";
import { Slider } from "../components/Slider.tsx";

export interface Props {
  title: string;
  showArrows: boolean;
  productData: ProductList;
}

export default function ProductShelf({
  title,
  showArrows,
  productData,
}: Props) {
  return (
    <div class="flex flex-col">
      <span class="font-bold text-center">{title}</span>
      <Slider showArrows={showArrows}>
        {productData.products.map((product) => (
          <ProductSummary product={product} key={product.id} />
        ))}
      </Slider>
    </div>
  );
}
```

Diferente de projetos tradicionais, as seções não são instanciadas em outro arquivo usando algo como `<ProductShelf .../>`, mas sim são **injetadas dinamicamente** em páginas criadas por usuários.

Ainda assim, **seções podem declarar Props**, indicando como aquela seção pode ser configurada. Essa declaração é usada para renderizar um formulário dentro do CMS.

<img width="319" alt="image" src="https://user-images.githubusercontent.com/18706156/201562065-462e591d-9ef7-4fcc-a1e0-34944725613c.png">

Propriedades de tipos comuns como `string`, `boolean` ou `Array<{ key: string, value: string}>` são preenchidas pelos usuários diretamente através deste formulário. Já propriedades de **tipos complexos** como `Product` e `ProductList`, exportados pelo _Live_, indicam que aquele dado **deverá ser injetado através de alguma integração**, que são adicionadas a páginas e são definidas por funções.

### Funções

Funções no _Live_ são similares a [funções convencionais do Typescript](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#functions) e servem primariamente para fazer **carregamento de dados através de APIs**. Dependendo do **tipo de retorno** dessas funções, o _Live_ permitirá que elas possam ser vinculadas com seções. O código das funções é executado no servidor da edge, antes da página ser renderizada.

Aqui o exemplo de uma função `vtexIntelligentSearch`:

```typescript
import {
  vtexClient,
  mapVtexProductToDecoProduct,
} from "$live/std/commerce/clients/vtex.ts";
import { ProductList } from "$live/std/commerce/types/ProductList.ts";
import { LoaderFunction } from "$live/std/types.ts";

export interface Props {
  searchQuery: string;
  count: number;
}

const VTEXIntelligentSearch: LoaderFunction<Props, ProductList> = async (
  _req,
  _ctx,
  { searchQuery, count }
) => {
  const data = await vtexClient().search({ query: searchQuery, count });

  const mappedProducts = data?.products.map(mapVtexProductToDecoProduct);

  return { data: { products: mappedProducts } };
};
```

O tipo `LoaderFunction` é usado para indicar que essa função tem papel de carregamento de dados em uma página. Esse é um tipo genérico que aceita dois outros tipos como parâmetro: o tipo das Props e o tipo de retorno desta função (ex: `LoaderFunction<Props, ProductList>`).

Funções podem executar qualquer tipo de processamento de dados em seu código, porém devem sempre focar em **reduzir o tempo de carregamento**.

