import type {
  BreadcrumbList,
  ImageObject,
  Product,
  ProductDetailsPage,
  PropertyValue,
  UnitPriceSpecification,
} from "../types.ts";

import {
  Product as ProductShopify,
  SelectedOption as SelectedOptionShopify,
  Variant as SkuShopify,
} from "./types.ts";

const DEFAULT_IMAGE = {
  altText: "image",
  url:
    "https://storecomponents.vtexassets.com/assets/faststore/images/image___117a6d3e229a96ad0e0d0876352566e2.svg",
};

const getPath = ({ handle }: ProductShopify, sku?: SkuShopify) =>
  sku ? `/${handle}-${getIdFromVariantId(sku.id)}/p` : `/${handle}/p`;

/**
 * @description Transforms shopify gid to a number
 * @example getIdFromVariant("gid://shopify/ProductVariant/40306064162993") -> 40306064162993
 */
const getIdFromVariantId = (x: string) => {
  const splitted = x.split("/");

  return Number(splitted[splitted.length - 1]);
};

const getVariantIdFromId = (id: number) => `gid://shopify/ProductVariant/${id}`;

const nonEmptyArray = <T>(array: T[] | null | undefined) =>
  Array.isArray(array) && array.length > 0 ? array : null;

export const toProductPage = (
  product: ProductShopify,
  maybeSkuId?: number,
): ProductDetailsPage => {
  const skuId = maybeSkuId
    ? getVariantIdFromId(maybeSkuId)
    : product.variants.nodes[0]?.id;
  const sku = product.variants.nodes.find((node) => node.id === skuId);

  if (!sku) {
    throw new Error(`Missing sku ${skuId} on product ${product.title}`);
  }

  return {
    breadcrumbList: toBreadcrumbList(product, sku),
    product: toProduct(product, sku),
  };
};

export const toBreadcrumbList = (
  product: ProductShopify,
  sku: SkuShopify,
): BreadcrumbList => {
  return {
    "@type": "BreadcrumbList",
    numberOfItems: 1,
    itemListElement: [{
      "@type": "ListItem",
      name: product.title,
      item: getPath(product, sku),
      position: 1,
    }],
  };
};

export const toProduct = (
  product: ProductShopify,
  sku: SkuShopify,
  level = 0, // prevent inifinte loop while self referencing the product
): Product => {
  const {
    createdAt,
    description,
    images,
    id: productGroupID,
    variants,
    vendor,
  } = product;
  const {
    id: productID,
    barcode,
    selectedOptions,
    image,
    price,
    availableForSale,
    quantityAvailable,
    compareAtPrice,
  } = sku;

  const additionalProperty = selectedOptions.map(toPropertyValue);
  const allImages = nonEmptyArray([image, ...images.nodes]) ?? [DEFAULT_IMAGE];
  const hasVariant = level < 1 &&
    variants.nodes.map((variant) => toProduct(product, variant, 1));
  const priceSpec: UnitPriceSpecification[] = [{
    "@type": "UnitPriceSpecification",
    priceType: "https://schema.org/SalePrice",
    price: Number(price.amount),
  }];

  if (compareAtPrice) {
    priceSpec.push({
      "@type": "UnitPriceSpecification",
      priceType: "https://schema.org/ListPrice",
      price: Number(compareAtPrice.amount),
    });
  }

  return {
    "@type": "Product",
    productID,
    url: getPath(product, sku),
    name: sku.title,
    description,
    sku: productID,
    gtin: barcode,
    brand: vendor,
    releaseDate: createdAt,
    additionalProperty,
    isVariantOf: {
      "@type": "ProductGroup",
      productGroupID,
      hasVariant: hasVariant || [],
      url: getPath(product),
      name: product.title,
      additionalProperty: [],
    },
    image: allImages.map((img): ImageObject => ({
      "@type": "ImageObject",
      alternateName: img.altText ?? "",
      url: img.url,
    })),
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: price.currencyCode,
      highPrice: compareAtPrice
        ? Number(compareAtPrice.amount)
        : Number(price.amount),
      lowPrice: Number(price.amount),
      offerCount: 1,
      offers: [{
        "@type": "Offer",
        price: Number(price.amount),
        availability: availableForSale
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
        inventoryLevel: { value: quantityAvailable },
        priceSpecification: priceSpec,
      }],
    },
  };
};

const toPropertyValue = (option: SelectedOptionShopify): PropertyValue => ({
  "@type": "PropertyValue",
  ...option,
});
