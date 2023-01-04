import type {
  BreadcrumbList,
  ImageObject,
  Product,
  ProductDetailsPage,
} from "../types.ts";

import { Product as ProductOracle } from "./types.ts";

export const toProductPage = (
  product: ProductOracle,
): ProductDetailsPage => {
  return {
    breadcrumbList: toBreadcrumbList(product),
    product: toProduct(product),
  };
};

export const toBreadcrumbList = (
  product: ProductOracle,
): BreadcrumbList => {
  return {
    "@type": "BreadcrumbList",
    numberOfItems: 1,
    itemListElement: [{
      "@type": "ListItem",
      name: product.displayName,
      item: product.seoUrlSlugDerived,
      position: 1,
    }],
  };
};

export const toProduct = (
  product: ProductOracle,
): Product => {
  const {
    displayName,
    description,
    largeImageURLs: images,
    id: productID,
  } = product;

  return {
    "@type": "Product",
    productID,
    url: product.seoUrlSlugDerived,
    name: displayName,
    description,
    sku: productID,

    image: images.map((img): ImageObject => ({
      "@type": "ImageObject",
      url: `https://osklen.com.br/${img}`,
    })),
  };
};
