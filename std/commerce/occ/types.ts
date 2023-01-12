export interface OccSearch {
  _auditInfo: AuditInfo;
  resultsList: ResultsList;
  navigation: OccSearchNavigation;
  dynamicContent: Content;
  "@type": string;
  searchAdjustments: SearchAdjustments;
  additionalContent: Content;
  searchEventSummary: SearchEventSummary;
  name: string;
  "atg:currentSiteProductionURL": string;
  "@appFilterState": AppFilterState;
  breadcrumbs: Breadcrumbs;
}

export interface AppFilterState {
  _auditInfo: AuditInfo;
  hiddenNavigationFilter: string;
  securityFilter: null;
  "@type": string;
  recordFilters: string[];
  rollupKey: string;
}

export interface AuditInfo {
  resourcePath: string;
  innerPath: null | string;
}

export interface Content {
  _auditInfo: AuditInfo;
  ruleLimit: number;
  contents: any[];
  "@type": string;
  contentPaths: string[];
}

export interface Breadcrumbs {
  _auditInfo: AuditInfo;
  rangeFilterCrumbs: any[];
  searchCrumbs: SearchCrumb[];
  geoFilterCrumb: null;
  "@type": string;
  removeAllAction: RemoveAllAction;
  refinementCrumbs: any[];
}

export interface RemoveAllAction {
  contentPath: RemoveAllActionContentPath;
  "@class": string;
  navigationState: string;
  siteRootPath: SiteRootPath;
  siteState: SiteState;
  link: string;
  label: null | string;
  properties?: RemoveAllActionProperties;
}

export enum RemoveAllActionContentPath {
  Guidedsearch = "/guidedsearch",
}

export interface RemoveAllActionProperties {
  "DGraph.More": string;
  "DGraph.Spec": string;
  "dimval.prop.lowerBound": string;
  "record.urn": string;
  "dimval.match_type": string;
  "dimval.prop.displayName_en_US": string;
  "record.collection": string;
  "dimval.prop.upperBound": string;
  "dimval.range.comparison_type": string;
  "record.id": string;
}

export enum SiteRootPath {
  PagesDefaultServices = "/pages/Default/services",
}

export interface SiteState {
  validSite: boolean;
  contentPath: null;
  "@class": SiteStateClass;
  siteDisplayName: null;
  matchedUrlPattern: null;
  siteDefinition: null;
  siteId: SiteID;
  properties: SiteStateProperties;
}

export enum SiteStateClass {
  COMEndecaInfrontSiteModelSiteState = "com.endeca.infront.site.model.SiteState",
}

export interface SiteStateProperties {}

export enum SiteID {
  ErrorSiteNotFound = "@error:siteNotFound",
}

export interface SearchCrumb {
  removeAction: RemoveAllAction;
  "@class": string;
  correctedTerms: null;
  terms: string;
  key: string;
  matchMode: string;
}

export interface OccSearchNavigation {
  _auditInfo: AuditInfo;
  navigation: NavigationElement[];
  showAll: boolean;
  "@type": string;
}

export interface NavigationElement {
  "@type": string;
  displayName: string;
  name: string;
  ancestors: RemoveAllAction[];
  dimensionName: string;
  whyPrecedenceRuleFired: null;
  multiSelect: boolean;
  refinements: Refinement[];
}

export interface Refinement {
  contentPath: RemoveAllActionContentPath;
  "@class": RefinementClass;
  navigationState: string;
  siteRootPath: SiteRootPath;
  siteState: SiteState;
  count: number;
  link: string;
  label: string;
  properties: RefinementProperties;
  multiSelect: boolean;
  status: null;
}

export enum RefinementClass {
  COMEndecaInfrontCartridgeModelRefinement = "com.endeca.infront.cartridge.model.Refinement",
}

export interface RefinementProperties {
  "dimval.prop.category.repositoryId"?: string;
  "dimval.prop.displayName_pt-BR"?: string;
  "DGraph.Spec": string;
  "dimval.prop.category.ancestorCatalogIds"?: string;
  "record.urn"?: string;
  "record.collection"?: string;
  "record.id"?: string;
  "dimval.prop.category.catalogs.repositoryId"?: string;
  "dimval.prop.displayName_en"?: string;
  "dimval.prop.lowerBound"?: string;
  "dimval.match_type"?: string;
  "dimval.prop.displayName_en_US"?: string;
  "dimval.prop.upperBound"?: string;
  "dimval.range.comparison_type"?: string;
}

export interface ResultsList {
  _auditInfo: AuditInfo;
  pagingActionTemplate: RemoveAllAction;
  lastRecNum: number;
  rankingRules: RankingRules;
  records: ResultsListRecord[];
  totalNumRecs: number;
  sortOptions: any[];
  "@type": string;
  firstRecNum: number;
  precomputedSorts: any[];
  recsPerPage: number;
}

export interface RankingRules {
  merchRulePaths: string[];
  systemRulePaths: string[];
  systemRuleLimit: number;
}

export interface ResultsListRecord {
  "@class": RecordClass;
  detailsAction: DetailsAction;
  records: RecordRecord[];
  numRecords: number;
  attributes: Attributes;
}

export enum RecordClass {
  COMEndecaInfrontCartridgeModelRecord = "com.endeca.infront.cartridge.model.Record",
}

export interface Attributes {
  "product.repositoryId": string[];
  "sku.maxActivePrice": string[];
  "DGraph.RankLabel.bstratify.merch"?: string[];
  "sku.minActivePrice": string[];
  "record.id": string[];
}

export interface DetailsAction {
  contentPath: DetailsActionContentPath;
  "@class": DetailsActionClass;
  siteRootPath: SiteRootPath;
  siteState: SiteState;
  label: null;
  recordState: string;
}

export enum DetailsActionClass {
  COMEndecaInfrontCartridgeModelRecordAction = "com.endeca.infront.cartridge.model.RecordAction",
}

export enum DetailsActionContentPath {
  Recorddetails = "/recorddetails",
}

export interface RecordRecord {
  "@class": RecordClass;
  detailsAction: DetailsAction;
  records: null;
  numRecords: number;
  attributes: { [key: string]: string[] };
}

export interface SearchAdjustments {
  _auditInfo: AuditInfo;
  "@type": string;
  originalTerms: string[];
}

export interface SearchEventSummary {
  searchTermsCanonical: string;
  requestType: string;
  searchTermsLemmatized: string;
  "@type": string;
  context: Context;
  pageSize: number;
  page: number;
  resultsSummary: ResultsSummary[];
  searchTermsRaw: string;
}

export interface Context {
  priceGroup: string[];
  catalogId: string[];
  catalogDimensionValueId: string[];
  locale: string[];
}

export interface ResultsSummary {
  component: string;
  offset: number;
  records: ResultsSummaryRecord[];
  totalMatchingRecords: number;
  sort: null;
}

export interface ResultsSummaryRecord {
  "sku.listingId": string;
  "record.id": string;
}
export interface OccProductPage {
  data: Data;
  canonicalRoute: string;
  links: LinkElement[];
}

export interface Data {
  global: Global;
  page: Page;
}

export interface Global {
  loaded: boolean;
  pageContext: PageContext;
  search: Cart;
  site: GlobalSite;
  supportedLocales: SupportedLocale[];
  links: { [key: string]: LinkValue };
  locale: string;
  cart: Cart;
}

export interface Cart {}

export interface LinkValue {
  defaultPage: boolean;
  displayName: string;
  indexable: boolean;
  sites: SiteInfoElement[];
  rules: PageTypeItem[];
  source: null | string;
  pageTypeItem: PageTypeItem;
  target: number;
  route: string;
  pageType: string;
  repositoryId: string;
  name: string;
  supportedDevices: null;
  secured: boolean;
}

export interface PageTypeItem {
  repositoryId: string;
}

export interface SiteInfoElement {
  inventoryLocationId: InventoryLocationID | null;
  favicon: Favicon;
  repositoryId: ID;
  name: Name;
  noimage: null;
  id: ID;
}

export enum Favicon {
  FileV4170896362946869891GeneralFAVICONPNG = "/file/v4170896362946869891/general/FAVICON.png",
}

export enum ID {
  OsklenUSA = "osklenUSA",
  SiteUS = "siteUS",
}

export enum InventoryLocationID {
  OsklenUSADefaultLocation = "osklenUSADefaultLocation",
}

export enum Name {
  Osklen = "Osklen",
  OsklenUSA = "Osklen USA",
}

export interface PageContext {
  layout: Layout;
  pageType: Layout;
  page: Layout;
}

export interface Layout {
  name: string;
  displayName: string;
  id: string;
}

export interface GlobalSite {
  visitorServiceHost: string;
  isTaxIncluded: boolean;
  useDefaultSiteLocale: boolean;
  additionalFonts: Cart;
  priceListGroup: PriceListGroup;
  requireGDPRP13nConsent: boolean;
  siteInfo: SiteInfoElement;
  additionalLanguages: SupportedLocale[];
  requireGDPRCookieConsent: boolean;
  extensionSiteSettings: ExtensionSiteSettings;
  tenantId: string;
  currency: Currency;
  oracleCEC: OracleCEC;
  showTaxSummary: boolean;
  oracleUnifiedVisitHost: string;
}

export interface SupportedLocale {
  displayName: string;
  repositoryId: string;
  name: string;
  localeId: string;
}

export interface Currency {
  currencyType: null;
  symbol: string;
  deleted: boolean;
  displayName: string;
  repositoryId: string;
  fractionalDigits: number;
  currencyCode: string;
  numericCode: string;
}

export interface ExtensionSiteSettings {
  gtmSettings: GtmSettings;
  discountSettings: DiscountSettings;
  bazar: Bazar;
  discountFreightSettings: DiscountFreightSettings;
  imageSiteSettings: ImageSiteSettings;
  CouponRelationsSettings: CouponRelationsSettings;
}

export interface CouponRelationsSettings {
  crSettings: string;
}

export interface Bazar {
  landingPageBazar: boolean;
  landingPageBazarVip: boolean;
}

export interface DiscountFreightSettings {
  minValueFreeFreight: string;
}

export interface DiscountSettings {
  isCashDiscountEnable: boolean;
  pixDiscount: string;
  isPixDiscountEnable: boolean;
  cashDiscount: string;
  cardDiscount: string;
  isCardDiscountEnable: boolean;
}

export interface GtmSettings {
  id: string;
}

export interface ImageSiteSettings {
  favIconImage: FavIconImage;
}

export interface FavIconImage {
  src: Favicon;
  mediaName: string;
}

export interface OracleCEC {
  itemsMethod: string;
  apiPath: string;
}

export interface PriceListGroup {
  activePriceListGroups: DefaultPriceListGroupElement[];
  defaultPriceListGroup: DefaultPriceListGroupElement;
}

export interface DefaultPriceListGroupElement {
  isTaxIncluded: boolean;
  endDate: null;
  displayName: string;
  listPriceList: PageTypeItem;
  active: boolean;
  isPointsBased: boolean;
  locale: string;
  shippingSurchargePriceList: PageTypeItem;
  deleted: boolean;
  taxCalculationType: string;
  repositoryId: string;
  salePriceList: PageTypeItem;
  currency: Currency;
  id: string;
  includeAllProducts: boolean;
  startDate: null;
}

export interface Page {
  repositoryId: string;
  product: Product;
  contextId: string;
  pageType: string;
  pageId: string;
  productVariantOptions: ProductVariantOption[];
}

export interface Product {
  listVolumePrice: null;
  excludeFromSitemap: boolean;
  _comp: string;
  relatedProducts: RelatedProduct[];
  orderLimit: null;
  onlineOnly: boolean;
  listPrices: ListPrices;
  type: string;
  largeImageURLs: string[];
  listVolumePrices: ListPrices;
  shippable: boolean;
  addOnProducts: any[];
  derivedSalePriceFrom: string;
  primaryImageAltText: string;
  id: string;
  brand: string;
  parentCategories: ProductParentCategory[];
  height: number;
  defaultProductListingSku: null;
  assetable: boolean;
  x_medidas: null;
  unitOfMeasure: null;
  targetAddOnProducts: any[];
  primaryMediumImageURL: string;
  seoUrlSlugDerived: string;
  x_isGiftWrappable: boolean;
  weight: number;
  active: boolean;
  thumbImageURLs: string[];
  creationDate: Date;
  parentCategoryIdPath: string;
  route: string;
  relatedArticles: any[];
  mediumImageURLs: string[];
  primarySourceImageURL: string;
  parentCategory: ProductParentCategory;
  sourceImageURLs: string[];
  primarySmallImageURL: string;
  x_genero: string;
  avgCustRating: null;
  longDescription: string;
  primaryThumbImageURL: string;
  nonreturnable: boolean;
  directCatalogs: any[];
  displayName: string;
  description: string;
  salePrices: ListPrices;
  primaryFullImageURL: string;
  productVariantOptions: ProductVariantOption[];
  primaryLargeImageURL: string;
  smallImageURLs: string[];
  derivedShippingSurchargeFrom: string;
  shippingSurcharges: ListPrices;
  x_prazosDeEntregaEDevolues: string;
  saleVolumePrices: ListPrices;
  primaryImageTitle: string;
  saleVolumePrice: null;
  childSKUs: ProductChildSKUs[];
  relatedMediaContent: any[];
  salePrice: number;
  fullImageURLs: string[];
  length: number;
  x_gender: null;
  derivedDirectCatalogs: any[];
  variantValuesOrder: Cart;
  notForIndividualSale: boolean;
  background_color: null;
  repositoryId: string;
  derivedListPriceFrom: string;
  width: number;
  shippingSurcharge: null;
  defaultParentCategory: null;
  productImagesMetadata: Cart[];
  configurable: boolean;
  listPrice: number;
}

export interface ProductChildSKUs {
  dynamicPropertyMapLong: PurpleDynamicPropertyMapLong;
  bundleLinks: any[];
  largeImage: null;
  smallImage: null;
  listVolumePrice: null;
  onlineOnly: boolean;
  listPrices: ListPrices;
  configurationMetadata: any[];
  largeImageURLs: any[];
  productLine: null;
  listVolumePrices: ListPrices;
  derivedSalePriceFrom: string;
  model: string;
  barcode: string;
  salePriceEndDate: null;
  images: any[];
  x_medidas: null;
  unitOfMeasure: null;
  primaryMediumImageURL: null;
  dynamicPropertyMapBigString: Cart;
  active: boolean;
  thumbImageURLs: any[];
  mediumImageURLs: any[];
  primarySourceImageURL: null;
  sourceImageURLs: any[];
  primarySmallImageURL: null;
  x_genero: string;
  productFamily: null;
  primaryThumbImageURL: null;
  nonreturnable: boolean;
  displayName: string;
  salePrices: ListPrices;
  primaryFullImageURL: null;
  x_ean: null;
  productListingSku: null;
  primaryLargeImageURL: null;
  derivedOnlineOnly: boolean;
  smallImageURLs: any[];
  derivedShippingSurchargeFrom: string;
  shippingSurcharges: ListPrices;
  x_tamanho_sku: string;
  thumbnailImage: null;
  saleVolumePrices: ListPrices;
  x_subgrupo: string;
  saleVolumePrice: null;
  salePriceStartDate: null;
  quantity: null;
  salePrice: number;
  fullImageURLs: any[];
  x_tamanho: null;
  variantValuesOrder: Cart;
  soldAsPackage: boolean;
  listingSKUId: null;
  repositoryId: string;
  derivedListPriceFrom: string;
  shippingSurcharge: null;
  configurable: boolean;
  listPrice: number;
  x_prazoDeEntregaEDevolues: null;
}

export interface PurpleDynamicPropertyMapLong {
  "sku-vestuario_x_subgrupo": number;
  "sku-vestuario_x_tamanho_sku": number;
}

export interface ListPrices {
  "osklen-BRL": number | null;
}

export interface ProductParentCategory {
  longDescription: null | string;
  route: string;
  categoryImages: CategoryImage[];
  displayName: string;
  repositoryId: string;
  active: boolean;
  description: null | string;
  id: string;
}

export interface CategoryImage {
  path: string;
  metadata: Cart;
  repositoryId: string;
  name: string;
  url: string;
  tags: any[];
}

export interface ProductVariantOption {
  variantBasedDisplay: boolean;
  optionId: string;
  listingVariant: boolean;
  mapKeyPropertyAttribute: string;
  optionName: string;
  optionValueMap: OptionValueMap;
}

export interface OptionValueMap {
  Vestido?: number;
  P?: number;
  M?: number;
  G?: number;
}

export interface RelatedProduct {
  listVolumePrice: null;
  excludeFromSitemap: boolean;
  _comp: string;
  orderLimit: null;
  onlineOnly: boolean;
  listPrices: ListPrices;
  type: string;
  x_google_product_category: null;
  largeImageURLs: string[];
  coreProduct: boolean;
  listVolumePrices: ListPrices;
  shippable: boolean;
  addOnProducts: any[];
  derivedSalePriceFrom: string;
  primaryImageAltText: string;
  id: string;
  brand: string;
  parentCategories: PurpleParentCategory[];
  height: number;
  defaultProductListingSku: null;
  assetable: boolean;
  secondaryCurrencyShippingSurcharge: null;
  x_medidas: null;
  unitOfMeasure: null;
  targetAddOnProducts: any[];
  primaryMediumImageURL: string;
  seoUrlSlugDerived: string;
  x_isGiftWrappable: boolean;
  weight: number;
  active: boolean;
  thumbImageURLs: string[];
  parentCategoryIdPath: string;
  route: string;
  relatedArticles: any[];
  mediumImageURLs: string[];
  primarySourceImageURL: string;
  parentCategory: FluffyParentCategory;
  sourceImageURLs: string[];
  primarySmallImageURL: string;
  x_genero: string;
  avgCustRating: null;
  longDescription: string;
  primaryThumbImageURL: string;
  nonreturnable: boolean;
  directCatalogs: any[];
  displayName: string;
  description: string;
  salePrices: ListPrices;
  primaryFullImageURL: string;
  primaryLargeImageURL: string;
  smallImageURLs: string[];
  derivedShippingSurchargeFrom: string;
  shippingSurcharges: ListPrices;
  x_prazosDeEntregaEDevolues: string;
  saleVolumePrices: ListPrices;
  primaryImageTitle: string;
  saleVolumePrice: null;
  childSKUs: RelatedProductChildSKUs[];
  relatedMediaContent: any[];
  salePrice: number;
  fullImageURLs: string[];
  length: number;
  x_gender: null;
  derivedDirectCatalogs: any[];
  variantValuesOrder: null;
  notForIndividualSale: boolean;
  background_color: null;
  repositoryId: string;
  derivedListPriceFrom: string;
  width: number;
  shippingSurcharge: null;
  defaultParentCategory: null;
  productImagesMetadata: Cart[];
  configurable: boolean;
  listPrice: number;
}

export interface RelatedProductChildSKUs {
  dynamicPropertyMapLong: FluffyDynamicPropertyMapLong;
  bundleLinks: any[];
  largeImage: null;
  smallImage: null;
  listVolumePrice: null;
  onlineOnly: boolean;
  listPrices: ListPrices;
  configurationMetadata: any[];
  largeImageURLs: any[];
  productLine: null;
  listVolumePrices: ListPrices;
  derivedSalePriceFrom: string;
  model: null | string;
  barcode: string;
  salePriceEndDate: null;
  images: any[];
  x_medidas: null;
  unitOfMeasure: null;
  primaryMediumImageURL: null;
  dynamicPropertyMapBigString: Cart;
  active: boolean;
  thumbImageURLs: any[];
  mediumImageURLs: any[];
  primarySourceImageURL: null;
  sourceImageURLs: any[];
  primarySmallImageURL: null;
  x_genero: string;
  productFamily: null;
  primaryThumbImageURL: null;
  nonreturnable: boolean;
  displayName: string;
  salePrices: ListPrices;
  primaryFullImageURL: null;
  x_ean: null;
  productListingSku: null;
  primaryLargeImageURL: null;
  derivedOnlineOnly: boolean;
  smallImageURLs: any[];
  derivedShippingSurchargeFrom: string;
  shippingSurcharges: ListPrices;
  x_tamanho_sku: string;
  thumbnailImage: null;
  saleVolumePrices: ListPrices;
  x_subgrupo: string;
  saleVolumePrice: null;
  salePriceStartDate: null;
  quantity: null;
  salePrice: number;
  fullImageURLs: any[];
  x_tamanho: null;
  variantValuesOrder: Cart;
  soldAsPackage: boolean;
  listingSKUId: null;
  repositoryId: string;
  derivedListPriceFrom: string;
  shippingSurcharge: null;
  configurable: boolean;
  listPrice: number;
  x_prazoDeEntregaEDevolues: null;
}

export interface FluffyDynamicPropertyMapLong {
  "sku-generico_x_tamanho_sku"?: number;
  "sku-generico_x_subgrupo"?: number;
  "sku-calcadof_x_tamanho_sku"?: number;
  "sku-calcadof_x_subgrupo"?: number;
}

export interface PurpleParentCategory {
  longDescription: null | string;
  categoryImages: CategoryImage[];
  displayName: string;
  categoryPaths: string[];
  active: boolean;
  description: null | string;
  categoryIdPaths: string[];
  childCategories: ParentCategoryFixedParentCategory[] | null;
  fixedParentCategories: ParentCategoryFixedParentCategory[];
  creationDate: Date;
  parentCategoryIdPath: null | string;
  route: string;
  repositoryId: string;
  id: string;
}

export interface ParentCategoryFixedParentCategory {
  longDescription: null | string;
  categoryImages: CategoryImage[];
  displayName: string;
  categoryPaths: string[];
  active: boolean;
  description: null | string;
  categoryIdPaths: string[];
  childCategories: FixedParentCategoryFixedParentCategory[] | null;
  fixedParentCategories: FixedParentCategoryFixedParentCategory[];
  creationDate: Date;
  parentCategoryIdPath: null | string;
  route: string;
  repositoryId: string;
  id: string;
}

export interface FixedParentCategoryFixedParentCategory {
  longDescription: null | string;
  categoryImages: PageTypeItem[];
  displayName: string;
  categoryPaths: string[];
  active: boolean;
  description: null | string;
  categoryIdPaths: string[];
  childCategories: PageTypeItem[] | null;
  fixedParentCategories: PageTypeItem[];
  creationDate: Date;
  parentCategoryIdPath: null | string;
  route: string;
  repositoryId: string;
  id: string;
}

export interface FluffyParentCategory {
  longDescription: string;
  categoryImages: CategoryImage[];
  displayName: string;
  categoryPaths: string[];
  active: boolean;
  description: string;
  categoryIdPaths: string[];
  childCategories: ParentCategoryFixedParentCategory[] | null;
  fixedParentCategories: ParentCategoryFixedParentCategory[];
  creationDate: Date;
  parentCategoryIdPath: string;
  route: string;
  repositoryId: string;
  id: string;
}

export interface LinkElement {
  rel: string;
  href: string;
}

export interface CategoryDetailsImage {
  url?: string;
}

export interface CategoryDetails {
  displayName?: string;
  description?: string;
  longDescription?: string;
  categoryImages?: CategoryDetailsImage[];
}

export interface CategorySearchResult {
  totalResults: number;
  offset: number;
  limit: number;
  links: any;
  category?: CategoryDetails;
  items: any;
}

export interface ProductSkuInventoryStatus {
  [key: string]: any;
}
