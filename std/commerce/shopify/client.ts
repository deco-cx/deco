import { fetchAPI } from "$live/utils/fetchAPI.ts";
import { Product } from "./types.ts";

export interface Options {
  platform: "shopify";
  storeName: string;
  storefrontAccessToken: string;
}

const gql = (x: TemplateStringsArray) => x.toString().trim();

export const createClient = ({
  platform,
  storeName,
  storefrontAccessToken,
}: Options) => {
  const fetchGraphQL = async <T>(
    query: string,
    fragments: string[] = [],
    variables: Record<string, unknown> = {},
  ) => {
    const finalQuery = [query, ...fragments].join("\n");
    const { data, errors } = await fetchAPI<{ data?: T; errors: unknown[] }>(
      `https://${storeName}.myshopify.com/api/2022-10/graphql.json`,
      {
        method: "POST",
        body: JSON.stringify({
          query: finalQuery,
          variables,
        }),
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Storefront-Access-Token": storefrontAccessToken,
        },
      },
    );

    if (Array.isArray(errors) && errors.length > 0) {
      console.error(Deno.inspect(errors, { depth: 100, colors: true }));

      throw new Error(
        `Error while running query:\n${finalQuery}\n\n${
          JSON.stringify(variables)
        }`,
      );
    }

    return data;
  };

  const product = (handle: string) =>
    fetchGraphQL<{ product: Product }>(
      gql`
        query GetProduct($handle: String) {
          product(handle: $handle) {
            ...ProductFragment
          }
        }
      `,
      [ProductFragment],
      {
        handle,
      },
    );

  const products = (
    options: { first: number; after?: string; query?: string },
  ) =>
    fetchGraphQL<
      { products: { nodes: Product[]; pageInfo: { hasNextPage: boolean } } }
    >(
      gql`
        query GetProducts($first: Int, $after: String, $query: String) {
          products(first: $first, after: $after, query: $query) {
            pageInfo {
              hasNextPage
            }
            nodes {
              ...ProductFragment
            }
          }
        }
      `,
      [ProductFragment],
      options,
    );

  return {
    platform,
    product,
    products,
  };
};

const ProductVariantFragment = gql`
fragment ProductVariantFragment on ProductVariant {
  availableForSale
  barcode
  compareAtPrice {
    amount
    currencyCode
  }
  currentlyNotInStock
  id
  image {
    altText
    url
  }
  price {
    amount
    currencyCode
  }
  quantityAvailable
  requiresShipping
  selectedOptions {
    name
    value
  }
  sku
  title
  unitPrice {
    amount
    currencyCode
  }
  unitPriceMeasurement {
    measuredType
    quantityValue
    referenceUnit
    quantityUnit
  }
  weight
  weightUnit
}
`;

const ProductFragment = gql`
fragment ProductFragment on Product {
  availableForSale
  createdAt
  description
  descriptionHtml
  featuredImage {
    altText
    url
  }
  handle
  id
  images(first: 10) {
    nodes {
      altText
      url
    }
  }
  isGiftCard
  media(first: 10) {
    nodes {
      alt
      previewImage {
        altText
        url
      }
      mediaContentType
    }
  }
  onlineStoreUrl
  options {
    name
    values
  }
  priceRange {
    minVariantPrice {
      amount
      currencyCode
    }
    maxVariantPrice {
      amount
      currencyCode
    }
  }
  productType
  publishedAt
  requiresSellingPlan
  seo {
    title
    description
  }
  tags
  title
  totalInventory
  updatedAt
  variants(first: 10) {
    nodes {
      ...ProductVariantFragment
    }
  }
  vendor
}
` + ProductVariantFragment;
