import type { ProductPage } from "$live/std/types.ts";

import { slugify } from "./slugify.ts";
import type { Product as ProductVTEX } from "./types.ts";

const getSlug = (link: string, id: string) => `${link}-${id}`;
const getPath = (link: string, id: string) => `/${getSlug(link, id)}/p`;
const nonEmptyArray = <T>(array: T[] | null | undefined) =>
  Array.isArray(array) && array.length > 0 ? array : null;

const DEFAULT_IMAGE = {
  imageText: "image",
  imageUrl:
    "https://storecomponents.vtexassets.com/assets/faststore/images/image___117a6d3e229a96ad0e0d0876352566e2.svg",
};

export const toProductPage = (
  product: ProductVTEX,
  maybeSkuId?: string,
): ProductPage => {
  const skuId = maybeSkuId ?? product.items[0]?.itemId;
  const sku = product.items.find((item) => item.itemId === skuId);

  if (!sku) {
    throw new Error(`Missing sku ${skuId} on product ${product.productName}`);
  }

  const {
    productName,
    description,
    brand,
    releaseDate,
    categories,
    linkText,
  } = product;
  const { referenceId } = sku;
  const images = nonEmptyArray(sku.images) ?? [DEFAULT_IMAGE];

  return {
    breadcrumbList: {
      "@type": "BreadcrumbList",
      itemListElement: [
        ...categories.reverse().map((categoryPath, index) => {
          const splitted = categoryPath.split("/");
          const name = splitted[splitted.length - 2];
          const item = splitted.map(slugify).join("/");

          return {
            "@type": "ListItem" as const,
            name,
            item,
            position: index + 1,
          };
        }),
        {
          "@type": "ListItem",
          name: productName,
          item: getPath(linkText, skuId),
          position: categories.length + 1,
        },
      ],
      numberOfItems: categories.length,
    },
    product: {
      "@type": "Product",
      productID: skuId,
      name: productName,
      description,
      brand,
      sku: skuId,
      gtin: referenceId[0]?.Value,
      releaseDate,
      image: images.map(({ imageUrl, imageText }) => ({
        "@type": "ImageObject" as const,
        alternateName: imageText ?? "",
        url: imageUrl.replace("vteximg.com.br", "vtexassets.com"),
      })),
      // offers: sku.sellers
      //   .map((seller) =>
      //     enhanceCommercialOffer({
      //       offer: seller.commertialOffer,
      //       seller,
      //       product: root,
      //     })
      //   )
      //   .sort(bestOfferFirst),
    },
  };
};

// {

//   slug: ({ isVariantOf: { linkText }, itemId }) => getSlug(linkText, itemId),

//   seo: ({ isVariantOf }) => ({
//     title: isVariantOf.productName,
//     description: isVariantOf.description,
//     canonical: canonicalFromProduct(isVariantOf),
//   }),

//   isVariantOf: (root) => root,
//   additionalProperty: ({
//     // Search uses the name variations for specifications
//     variations: specifications = [],
//     attachmentsValues = [],
//   }) => {
//     const propertyValueSpecifications = specifications.flatMap(
//       ({ name, values }) =>
//         values.map((value) => ({
//           name,
//           value,
//           valueReference: VALUE_REFERENCES.specification,
//         }))
//     )

//     const propertyValueAttachments = attachmentsValues.map(
//       attachmentToPropertyValue
//     )

//     return [...propertyValueSpecifications, ...propertyValueAttachments]
//   },

// }
