export interface LegacySearchArgs {
  query?: string;
  page: number;
  count: number;
  type: "product_search" | "facets";
  selectedFacets?: SelectedFacet[];
  sort?: LegacySort;
}

export type LegacySort =
  | "OrderByPriceDESC"
  | "OrderByPriceASC"
  | "OrderByTopSaleDESC"
  | "OrderByReviewRateDESC"
  | "OrderByNameASC"
  | "OrderByNameDESC"
  | "OrderByReleaseDateDESC"
  | "OrderByBestDiscountDESC"
  | "OrderByScoreDESC"
  | "";

export interface SearchArgs {
  /**
   * @description VTEX Account name.
   */
  account: string;
  query?: string;
  page: number;
  count: number;
  type: "product_search" | "facets";
  sort?: Sort;
  selectedFacets?: SelectedFacet[];
  fuzzy?: "0" | "1" | "auto";
  hideUnavailableItems?: boolean;
  locale?: string;
  salesChannel?: string;
}

export interface SelectedFacet {
  key: string;
  value: string;
}

export type Sort =
  | "price:desc"
  | "price:asc"
  | "orders:desc"
  | "name:desc"
  | "name:asc"
  | "release:desc"
  | "discount:desc"
  | "";

export interface Suggestion {
  searches: Search[];
}

export interface Search {
  term: string;
  count: number;
}

export interface ProductSearchResult {
  /**
   * @description Total of products.
   */
  recordsFiltered: number;
  products: Product[];
  pagination: Pagination;
  sampling: boolean;
  options: Options;
  translated: boolean;
  locale: string;
  query: string;
  operator: "and" | "or";
  fuzzy: string;
  correction?: Correction;
}

interface Correction {
  misspelled: boolean;
}

interface Options {
  sorts: {
    field: string;
    order: string;
    active?: boolean;
    proxyURL: string;
  }[];
  counts: Count[];
}

interface Count {
  count: number;
  proxyURL: string;
}

interface Pagination {
  count: number;
  current: Page;
  before: Page[];
  after: Page[];
  perPage: number;
  next: Page;
  previous: Page;
  first: Page;
  last: Page;
}

interface Page {
  index: number;
  proxyURL: string;
}

export interface First {
  index: number;
}

export interface Suggestion {
  searches: Search[];
}

export interface Search {
  term: string;
  count: number;
}

interface IProduct {
  productId: string;
  productName: string;
  brand: string;
  brandId: number;
  cacheId?: string;
  linkText: string;
  productReference: string;
  categoryId: string;
  clusterHighlights: Record<string, unknown>;
  productClusters: Record<string, string>;
  categories: string[];
  categoriesIds: string[];
  link: string;
  description: string;
  /**
   * @description Product SKUs.
   */
  items: Item[];
  skuSpecifications?: SkuSpecification[];
  priceRange: PriceRange;
  specificationGroups: SpecificationGroup[];
  properties: Array<{ name: string; values: string[] }>;
  selectedProperties: Array<{ key: string; value: string }>;
  releaseDate: string;
}

export type Product = IProduct & { items: Item[]; origin?: string };

export type LegacyProduct = IProduct & { items: LegacyItem[]; origin?: string };

export type LegacyFacets = {
  Departments: LegacyFacet[];
  Brands: LegacyFacet[];
  SpecificationFilters: Record<string, LegacyFacet[]>;
};

export interface PageType {
  id: string | null;
  name: string | null;
  url: string | null;
  title: string | null;
  metaTagDescription: string | null;
  pageType:
    | "Brand"
    | "Category"
    | "Department"
    | "SubCategory"
    | "Product"
    | "Collection"
    | "Cluster"
    | "NotFound"
    | "FullText";
}

export interface LegacyFacet {
  Quantity: number;
  Name: string;
  Link: string;
  LinkEncoded: string;
  Map: string;
  Value: string;
  Children: LegacyFacet[];
}

interface Image {
  imageId: string;
  imageLabel: string | null;
  imageTag: string;
  imageUrl: string;
  imageText: string;
}

interface Installment {
  Value: number;
  InterestRate: number;
  TotalValuePlusInterestRate: number;
  NumberOfInstallments: number;
  PaymentSystemName: string;
  PaymentSystemGroupName: string;
  Name: string;
}

export type LegacyItem = Omit<Item, "variations"> & {
  variations: string[];
} & Record<string, string[]>;

export interface Item {
  itemId: string;
  name: string;
  nameComplete: string;
  complementName: string;
  ean: string;
  referenceId: Array<{ Key: string; Value: string }>;
  measurementUnit: string;
  unitMultiplier: number;
  modalType: unknown | null;
  images: Image[];
  Videos: string[];
  variations: Array<{
    name: string;
    values: string[];
  }>;
  sellers: Seller[];
  attachments: Array<{
    id: number;
    name: string;
    required: boolean;
    domainValues: string;
  }>;
  isKit: boolean;
  kitItems?: Array<{
    itemId: string;
    amount: number;
  }>;
}

export interface CommertialOffer {
  DeliverySlaSamplesPerRegion: Record<
    string,
    { DeliverySlaPerTypes: unknown[]; Region: unknown | null }
  >;
  Installments: Installment[];
  DiscountHighLight: unknown[];
  GiftSkuIds: string[];
  Teasers: Array<Record<string, unknown>>;
  teasers?: Array<Record<string, unknown>>;
  BuyTogether: unknown[];
  ItemMetadataAttachment: unknown[];
  Price: number;
  ListPrice: number;
  spotPrice: number;
  PriceWithoutDiscount: number;
  RewardValue: number;
  PriceValidUntil: string;
  AvailableQuantity: number;
  Tax: number;
  DeliverySlaSamples: Array<{
    DeliverySlaPerTypes: unknown[];
    Region: unknown | null;
  }>;
  GetInfoErrorMessage: unknown | null;
  CacheVersionUsedToCallCheckout: string;
}

export interface Seller {
  sellerId: string;
  sellerName: string;
  addToCartLink: string;
  sellerDefault: boolean;
  commertialOffer: CommertialOffer;
}

export interface SkuSpecification {
  field: SKUSpecificationField;
  values: SKUSpecificationValue[];
}
export interface SKUSpecificationValue {
  name: string;
  id?: string;
  fieldId?: string;
  originalName?: string;
}

export interface SKUSpecificationField {
  name: string;
  originalName?: string;
  id?: string;
}

export interface Price {
  highPrice: number | null;
  lowPrice: number | null;
}

export interface PriceRange {
  sellingPrice: Price;
  listPrice: Price;
}

export interface SpecificationGroup {
  name: string;
  originalName: string;
  specifications: Array<{
    name: string;
    originalName: string;
    values: string[];
  }>;
}

export type FilterType = "PRICERANGE" | "TEXT" | "NUMBER" | "CATEGORYTREE";

export interface FacetSearchResult {
  facets: Facet[];
  breadcrumb: Breadcrumb[];
}

export interface Facet<T = FacetValueBoolean | FacetValueRange> {
  type: FilterType;
  name: string;
  hidden: boolean;
  values: T[];
  quantity: number;
  key: string;
}

export interface FacetValueBoolean {
  quantity: number;
  name: string;
  key: string;
  value: string;
  selected: boolean;
  href: string;
}

export interface FacetValueRange {
  range: {
    from: number;
    to: number;
  };
}

export interface Breadcrumb {
  href: string;
  name: string;
}
