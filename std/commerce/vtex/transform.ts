import type {
  BreadcrumbList,
  Filter,
  Offer,
  Product,
  ProductDetailsPage,
  PropertyValue,
  UnitPriceSpecification,
} from "./../types.ts";

import { slugify } from "./slugify.ts";
import type {
  CommertialOffer,
  Facet as FacetVTEX,
  FacetValueBoolean,
  FacetValueRange,
  Item as SkuVTEX,
  LegacyFacet,
  LegacyItem as LegacySkuVTEX,
  LegacyProduct as LegacyProductVTEX,
  Product as ProductVTEX,
  Seller as SellerVTEX,
} from "./types.ts";

const isLegacySku = (
  sku: LegacySkuVTEX | SkuVTEX,
): sku is LegacySkuVTEX => typeof (sku as any).variations?.[0] === "string";

const isLegacyProduct = (
  product: ProductVTEX | LegacyProductVTEX,
): product is LegacyProductVTEX => product.origin !== "intelligent-search";

const getPath = ({ linkText }: { linkText: string }, skuId?: string) => {
  const params = new URLSearchParams();

  if (skuId) {
    params.set("skuId", skuId);
  }

  return `/${linkText}/p?${params.toString()}`;
};

const nonEmptyArray = <T>(array: T[] | null | undefined) =>
  Array.isArray(array) && array.length > 0 ? array : null;

const DEFAULT_IMAGE = {
  imageText: "image",
  imageUrl:
    "https://storecomponents.vtexassets.com/assets/faststore/images/image___117a6d3e229a96ad0e0d0876352566e2.svg",
};

export const toProductPage = (
  product: ProductVTEX | LegacyProductVTEX,
  maybeSkuId?: string,
): ProductDetailsPage => {
  const skuId = maybeSkuId ?? product.items[0]?.itemId;
  const sku = product.items.find((item) => item.itemId === skuId);

  if (!sku) {
    throw new Error(`Missing sku ${skuId} on product ${product.productName}`);
  }

  return {
    breadcrumbList: toBreadcrumbList(product, sku),
    product: toProduct(product, sku, 0),
  };
};

export const inStock = (offer: CommertialOffer) => offer.AvailableQuantity > 0;

// Smallest Available Spot Price First
export const bestOfferFirst = (
  a: SellerVTEX,
  b: SellerVTEX,
) => {
  if (inStock(a.commertialOffer) && !inStock(b.commertialOffer)) {
    return -1;
  }

  if (!inStock(a.commertialOffer) && inStock(b.commertialOffer)) {
    return 1;
  }

  return a.commertialOffer.spotPrice - b.commertialOffer.spotPrice;
};

export const toProduct = <P extends LegacyProductVTEX | ProductVTEX>(
  product: P,
  sku: P["items"][number],
  level = 0, // prevent inifinte loop while self referencing the product
): Product => {
  const {
    brand,
    productId,
    description,
    releaseDate,
    items,
  } = product;
  const { name, ean, itemId: skuId } = sku;

  const groupAdditionalProperty = isLegacyProduct(product)
    ? legacyToProductGroupAdditionalProperties(product)
    : toProductGroupAdditionalProperties(product);
  const additionalProperty = isLegacySku(sku)
    ? toAdditionalPropertiesLegacy(sku)
    : toAdditionalProperties(sku);
  const images = nonEmptyArray(sku.images) ?? [DEFAULT_IMAGE];
  const offers = sku.sellers.sort(bestOfferFirst).map(toOffer);
  const hasVariant = level < 1 &&
    items.map((sku) => toProduct(product, sku, 1));

  return {
    "@type": "Product",
    productID: skuId,
    url: getPath(product, sku.itemId),
    name,
    description,
    brand,
    sku: skuId,
    gtin: ean,
    releaseDate,
    additionalProperty,
    isVariantOf: {
      "@type": "ProductGroup",
      productGroupID: productId,
      hasVariant: hasVariant || [],
      url: getPath(product, sku.itemId),
      name: product.productName,
      additionalProperty: groupAdditionalProperty,
    },
    image: images.map(({ imageUrl, imageText }) => ({
      "@type": "ImageObject" as const,
      alternateName: imageText ?? "",
      url: imageUrl,
    })),
    offers: offers.length > 0
      ? {
        "@type": "AggregateOffer",
        highPrice: offers[0].price,
        lowPrice: offers[offers.length - 1].price,
        offerCount: offers.length,
        offers,
      }
      : undefined,
  };
};

const toBreadcrumbList = (
  product: ProductVTEX,
  sku: SkuVTEX,
): BreadcrumbList => {
  const { categories, productName } = product;

  return {
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
        item: getPath(product, sku.itemId),
        position: categories.length + 1,
      },
    ],
    numberOfItems: categories.length + 1,
  };
};

const legacyToProductGroupAdditionalProperties = ({}: LegacyProductVTEX) => [];

const toProductGroupAdditionalProperties = ({ properties = [] }: ProductVTEX) =>
  properties.flatMap(({ name, values }) =>
    values.map((value) =>
      ({
        "@type": "PropertyValue",
        name,
        value,
        valueReference: "PROPERTY" as string,
      }) as const
    )
  );

const toAdditionalProperties = (
  sku: SkuVTEX,
): PropertyValue[] =>
  sku.variations?.flatMap(({ name, values }) =>
    values.map((value) =>
      ({
        "@type": "PropertyValue",
        name,
        value,
        valueReference: "SPECIFICATION",
      }) as const
    )
  ) ?? [];

const toAdditionalPropertiesLegacy = (sku: LegacySkuVTEX): PropertyValue[] =>
  sku.variations?.flatMap((variation) =>
    sku[variation].map((value) =>
      ({
        "@type": "PropertyValue",
        name: variation,
        value,
        valueReference: "SPECIFICATION",
      }) as const
    )
  ) ?? [];

const toOffer = ({
  commertialOffer: offer,
  sellerId,
}: SellerVTEX): Offer => ({
  "@type": "Offer",
  price: offer.spotPrice ?? offer.Price,
  seller: sellerId,
  priceValidUntil: offer.PriceValidUntil,
  inventoryLevel: { value: offer.AvailableQuantity },
  priceSpecification: [
    {
      "@type": "UnitPriceSpecification",
      priceType: "https://schema.org/ListPrice",
      price: offer.ListPrice,
    },
    {
      "@type": "UnitPriceSpecification",
      priceType: "https://schema.org/SalePrice",
      price: offer.Price,
    },
    ...offer.Installments.map((installment): UnitPriceSpecification => ({
      "@type": "UnitPriceSpecification",
      priceType: "https://schema.org/SalePrice",
      priceComponentType: "https://schema.org/Installment",
      name: installment.PaymentSystemName,
      description: installment.Name,
      billingDuration: installment.NumberOfInstallments,
      billingIncrement: installment.Value,
      price: installment.TotalValuePlusInterestRate,
    })),
  ],
  availability: offer.AvailableQuantity > 0
    ? "https://schema.org/InStock"
    : "https://schema.org/OutOfStock",
});

const unselect = (facet: LegacyFacet, url: URL, map: string) => {
  const mapSegments = map.split(",");

  // Do not allow removing root facet to avoid going back to home page
  if (mapSegments.length === 1) {
    return `${url.pathname}${url.search}`;
  }

  const index = mapSegments.findIndex((segment) => segment === facet.Map);
  mapSegments.splice(index, index > -1 ? 1 : 0);
  const newUrl = new URL(
    url.pathname.replace(`/${facet.Value}`, ""),
    url.origin,
  );
  newUrl.search = url.search;
  if (mapSegments.length > 0) {
    newUrl.searchParams.set("map", mapSegments.join(","));
  }

  return `${newUrl.pathname}${newUrl.search}`;
};

export const legacyFacetToFilter = (
  name: string,
  facets: LegacyFacet[],
  url: URL,
  map: string,
): Filter | null => {
  const mapSegments = new Set(map.split(","));
  const pathSegments = new Set(
    url.pathname.split("/").slice(0, mapSegments.size + 1),
  );

  return {
    "@type": "FilterToggle",
    quantity: facets.length,
    label: name,
    key: name,
    values: facets.map((facet) => {
      const selected = mapSegments.has(facet.Map) &&
        pathSegments.has(facet.Value);
      const href = selected ? unselect(facet, url, map) : facet.LinkEncoded;

      return ({
        value: facet.Value,
        quantity: facet.Quantity,
        url: href,
        label: facet.Name,
        selected,
      });
    }),
  };
};

export const filtersToSearchParams = (
  selectedFacets: { key: string; value: string }[],
) => {
  const searchParams = new URLSearchParams();

  for (const { key, value } of selectedFacets) {
    searchParams.append(`filter.${key}`, value);
  }

  return searchParams;
};

export const filtersFromSearchParams = (params: URLSearchParams) => {
  const selectedFacets: { key: string; value: string }[] = [];

  params.forEach((value, name) => {
    const [filter, key] = name.split(".");

    if (filter === "filter" && typeof key === "string") {
      selectedFacets.push({ key, value });
    }
  });

  return selectedFacets;
};

export const toFilter = (
  facet: FacetVTEX,
  selectedFacets: { key: string; value: string }[],
): Filter | null => {
  if (facet.hidden) {
    return null;
  }

  if (facet.type === "PRICERANGE") {
    return {
      "@type": "FilterRange",
      label: facet.name,
      key: facet.key,
      values: {
        min: (facet.values as FacetValueRange[]).reduce(
          (acc, curr) => acc > curr.range.from ? curr.range.from : acc,
          Infinity,
        ),
        max: (facet.values as FacetValueRange[]).reduce(
          (acc, curr) => acc < curr.range.to ? curr.range.to : acc,
          0,
        ),
      },
    };
  }

  return {
    "@type": "FilterToggle",
    key: facet.key,
    label: facet.name,
    quantity: facet.quantity,
    values: (facet.values as FacetValueBoolean[]).map((
      { quantity, name, value, selected },
    ) => {
      const newFacet = { key: facet.key, value };
      const filters = selected
        ? selectedFacets.filter((facet) =>
          facet.key !== newFacet.key && facet.value !== newFacet.value
        )
        : [...selectedFacets, newFacet];

      return {
        value,
        quantity,
        selected,
        url: `?${filtersToSearchParams(filters).toString()}`,
        label: name,
      };
    }),
  };
};
