import type {
  BreadcrumbList,
  ImageObject,
  Offer,
  Product,
  ProductDetailsPage,
} from "../types.ts";

import {
  Product as ProductOracle,
  ProductSkuInventoryStatus,
} from "./types.ts";

const setAvailabilityOffer = (
  stock: ProductSkuInventoryStatus,
  productId: string
) => {
  const offer: Offer[] = [];

  for (const property in stock) {
    offer.push({
      "@type": "Offer",
      price: 0,
      priceSpecification: [],
      additionalType: property.replace(productId, ""),
      availability:
        stock[property] > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
      inventoryLevel: {
        value: stock[property],
      },
    });
  }

  return offer;
};

export const toProductPage = (
  product: ProductOracle,
  stock: ProductSkuInventoryStatus
): ProductDetailsPage => {
  return {
    breadcrumbList: toBreadcrumbList(product),
    product: toProduct(product, stock),
  };
};

export const toBreadcrumbList = (product: ProductOracle): BreadcrumbList => {
  return {
    "@type": "BreadcrumbList",
    numberOfItems: 1,
    itemListElement: [
      {
        "@type": "ListItem",
        name: product.displayName,
        item: product.seoUrlSlugDerived,
        position: 1,
      },
    ],
  };
};

export const toProduct = (
  product: ProductOracle,
  stock: ProductSkuInventoryStatus
): Product => {
  const {
    displayName,
    largeImageURLs: images,
    id: productID,
    listPrice,
    longDescription,
    _comp,
    x_prazosDeEntregaEDevolues,
  } = product;

  return {
    "@type": "Product",
    productID,
    url: product.seoUrlSlugDerived,
    name: displayName,
    sku: productID,
    offers: {
      "@type": "AggregateOffer",
      highPrice: listPrice,
      lowPrice: listPrice,
      offerCount: 1,
      offers: stock ? setAvailabilityOffer(stock, productID) : [],
    },
    additionalProperty: [
      {
        "@type": "PropertyValue",
        name: "descrição",
        value: longDescription,
      },
      {
        "@type": "PropertyValue",
        name: "composição",
        value: _comp,
      },
      {
        "@type": "PropertyValue",
        name: "entregas e devoluções",
        value: x_prazosDeEntregaEDevolues,
      },
      {
        "@type": "PropertyValue",
        name: "sobre a marca",
        value:
          "OSKLEN é a expressão de um lifestyle genuíno definido pelo equilíbrio de uma vida urbana integrada à natureza em que o orgânico e o tecnológico, o local e o global, o luxo e a simplicidade são complementares.",
      },
    ],
    image: images.map(
      (img): ImageObject => ({
        "@type": "ImageObject",
        url: `https://osklen.com.br/${img}`,
      })
    ),
  };
};
