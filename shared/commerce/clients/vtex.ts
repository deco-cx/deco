import { Product } from "../types/Product.ts";

export default class VTEXIntelligentSearchClient {
  private baseUrl: string;

  constructor(account: string) {
    this.baseUrl = `https://vtex-search-proxy.global.ssl.fastly.net/${
      account
    }/intelligent-search`;
  }

  private async _search<T>({
    page,
    query = "",
    count,
    type,
    sort = "",
    selectedFacets = [],
    fuzzy = "auto",
    hideUnavailableItems,
  }: SearchArgs): Promise<T> {
    const params = new URLSearchParams({
      page: (page + 1).toString(),
      count: count.toString(),
      query,
      sort,
      fuzzy,
    });

    if (hideUnavailableItems !== undefined) {
      params.append("hideUnavailableItems", hideUnavailableItems.toString());
    }

    const pathname = addDefaultFacets(selectedFacets)
      .map(({ key, value }) => `${key}/${value}`)
      .join("/");

    const data = await fetch(
      `${this.baseUrl}/${type}/${pathname}?${params.toString() ?? ""}`,
    ).then((r) => r.json());

    return data as T;
  }

  public search(args: Omit<SearchArgs, "type">) {
    return this._search<ProductsResponse>({ ...args, type: "product_search" });
  }

  public facets(args: Omit<SearchArgs, "type">) {
    return this._search<FacetsResponse>({ ...args, type: "facets" });
  }
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

export interface SearchArgs {
  query?: string;
  /**
   * @description any value greater than or equal to 1
   */
  page: number;
  /**
   * @description any value greater than or equal to 1
   */
  count: number;
  type: "product_search" | "facets";
  sort?: Sort;
  selectedFacets?: SelectedFacet[];
  fuzzy?: "0" | "1" | "auto";
  hideUnavailableItems?: boolean;
}

function addDefaultFacets(facets: SelectedFacet[]): SelectedFacet[] {
  return [...facets, { key: "trade-policy", value: "1" }];
}

export const isSellerAvailable = (seller: Item["sellers"][0]) =>
  seller.commertialOffer.Price > 0;

export const mapVTEXIntelligentSearchProduct = (skuId?: string) =>
({
  productId,
  productName: name,
  linkText,
  items,
  brand,
  categories,
  description,
  priceRange,
  Cor,
}: VTEXProduct): Product => {
  const selectedItem =
    items.find((item) =>
      skuId ? item.itemId === skuId : item.sellers?.some(isSellerAvailable)
    ) || (items[0] as Item);

  if (!selectedItem) {
    throw new Error("Trying to map a product that doesnt have SKUs");
  }

  const seller = selectedItem.sellers?.find(isSellerAvailable)!;
  const installment = seller?.commertialOffer?.Installments.reduce(
    (result, installment) =>
      installment.Value <= result.Value &&
        installment.NumberOfInstallments >= result.NumberOfInstallments
        ? installment
        : result,
    {
      interestRate: 100.0,
      NumberOfInstallments: 0,
      Value: Infinity,
    } as Installment,
  );

  const breadcrumb = [
    { label: brand, url: `/${brand.toLocaleLowerCase()}` },
    ...categories?.[0]
      .split("/")
      .filter(Boolean)
      .map((label) => ({
        label,
        url: `/search?ft=${label}`,
      })),
  ];

  const specifications = selectedItem?.variations?.reduce(
    (acc, cur) => ({ ...acc, [cur.name]: cur.values?.[0] }),
    {},
  );

  // This is hardcoded for "Tamanho" variations
  const skuOptions = items
    .filter((item) => item.sellers?.some(isSellerAvailable))
    .map((item) => ({
      variationValue: item?.["Tamanho"]?.[0],
      skuUrl: `/${linkText}-${item.itemId}/p`,
    }))
    .sort(
      (a, z) => parseInt(a.variationValue, 10) - parseInt(z.variationValue),
    );

  const prices = priceRange
    ? {
      price: priceRange?.sellingPrice?.lowPrice,
      listPrice: priceRange?.listPrice?.highPrice,
    }
    : {
      price: seller.commertialOffer.Price,
      listPrice: seller.commertialOffer.ListPrice,
    };

  return {
    name,
    // TODO: This is itemId/skuId. Solve this ambiguity.
    id: selectedItem.itemId,
    productId,
    sellerId: seller?.sellerId ?? "1",
    slug: `${linkText}-${selectedItem.itemId}/p`,
    image: {
      src: selectedItem.images[0].imageUrl,
      alt: selectedItem.images[0].imageLabel,
    },
    images: selectedItem.images.map(
      ({ imageUrl, imageLabel, imageText }) => ({
        src: imageUrl,
        alt: imageText,
        label: imageLabel,
      }),
    ),
    imageHover: selectedItem.images[1]
      ? {
        src: selectedItem.images[1].imageUrl,
        alt: selectedItem.images[1].imageLabel,
      }
      : undefined,
    ...prices,
    brand,
    description,
    installments: installment
      ? `${installment.NumberOfInstallments ?? 0} de R$ ${
        installment.Value.toFixed(2)
      } ${installment.InterestRate >= 0.0 ? "s/ juros" : "com juros"}`
      : "",
    breadcrumb,
    specifications,
    skuOptions,
    color: Cor?.[0],
  };
};

export interface ProductsResponse {
  products: VTEXProduct[];
}
export interface FacetsResponse {
  facets: Facet[];
  sampling: boolean;
  breadcrumb: Breadcrumb[];
  queryArgs: QueryArgs;
  translated: boolean;
}

export interface Breadcrumb {
  name: string;
  href: string;
}

export interface Facet {
  values: Value[];
  type: Type;
  name: string;
  hidden: boolean;
  key: Key;
  quantity: number;
}

export enum Key {
  Brand = "brand",
  Category1 = "category-1",
  Category2 = "category-2",
  Category3 = "category-3",
  Colecao = "colecao",
  Cor = "cor",
  CoresFiltraveis = "cores-filtraveis",
  Genero = "genero",
  IDColecao = "id-colecao",
  Marca = "marca",
  Price = "price",
  Sale = "sale",
  Tamanho = "tamanho",
}

export enum Type {
  Pricerange = "PRICERANGE",
  Text = "TEXT",
}

export interface Value {
  quantity: number;
  name: string;
  key: Key;
  selected: boolean;
  range?: Range;
  id?: string;
  value?: string;
  href?: string;
}

export interface Range {
  from: number;
  to: number;
}

export interface QueryArgs {
  query: string;
  selectedFacets: SelectedFacet[];
}

export interface SelectedFacet {
  key: string;
  value: string;
}

export interface OrderForm {
  orderFormId: string;
  salesChannel: string;
  loggedIn: boolean;
  isCheckedIn: boolean;
  storeId: null;
  checkedInPickupPointId: null;
  allowManualPrice: boolean;
  canEditData: boolean;
  userProfileId: null;
  userType: null;
  ignoreProfileData: boolean;
  value: number;
  messages: any[];
  items: OrderFormItem[];
  selectableGifts: any[];
  totalizers: Totalizer[];
  shippingData: ShippingData;
  clientProfileData: null;
  paymentData: PaymentData;
  marketingData: MarketingData;
  sellers: Seller[];
  clientPreferencesData: ClientPreferencesData;
  commercialConditionData: null;
  storePreferencesData: StorePreferencesData;
  giftRegistryData: null;
  openTextField: null;
  invoiceData: null;
  customData: null;
  itemMetadata: ItemMetadata;
  hooksData: null;
  ratesAndBenefitsData: RatesAndBenefitsData;
  subscriptionData: null;
  merchantContextData: null;
  itemsOrdination: null;
}

export interface ClientPreferencesData {
  locale: string;
  optinNewsLetter: null;
}

export interface ItemMetadata {
  items: ItemMetadataItem[];
}

export interface ItemMetadataItem {
  id: string;
  seller: string;
  name: string;
  skuName: string;
  productId: string;
  refId: string;
  ean: null | string;
  imageUrl: string;
  detailUrl: string;
  assemblyOptions: AssemblyOption[];
}

export interface AssemblyOption {
  id: string;
  name: string;
  required: boolean;
  inputValues: Schema;
  composition: null;
}

export interface Schema {
  Sku: Ean;
  Price: Ean;
  Qtde: Ean;
  EAN: Ean;
  Measuremt_unit: Ean;
  Unit_multiplier: Ean;
  Quantity: Ean;
}

export interface Ean {
  maximumNumberOfCharacters: number;
  domain: any[];
}

export interface OrderFormItem {
  uniqueId: string;
  id: string;
  productId: string;
  productRefId: string;
  refId: string;
  ean: null | string;
  name: string;
  skuName: string;
  modalType: null | string;
  parentItemIndex: null;
  parentAssemblyBinding: null;
  assemblies: any[];
  priceValidUntil: Date;
  tax: number;
  price: number;
  listPrice: number;
  manualPrice: null;
  manualPriceAppliedBy: null;
  sellingPrice: number;
  rewardValue: number;
  isGift: boolean;
  additionalInfo: AdditionalInfo;
  preSaleDate: null;
  productCategoryIds: string;
  productCategories: { [key: string]: string };
  quantity: number;
  seller: string;
  sellerChain: string[];
  imageUrl: string;
  detailUrl: string;
  components: Component[];
  bundleItems: any[];
  attachments: any[];
  attachmentOfferings: AttachmentOffering[];
  offerings: any[];
  priceTags: PriceTag[];
  availability: string;
  measurementUnit: string;
  unitMultiplier: number;
  manufacturerCode: null;
  priceDefinition: PriceDefinition;
}

export interface AdditionalInfo {
  dimension: null;
  brandName: null | string;
  brandId: null | string;
  offeringInfo: null;
  offeringType: null;
  offeringTypeId: null;
}

export interface AttachmentOffering {
  name: string;
  required: boolean;
  schema: Schema;
}

export interface Component {
  uniqueId: string;
  id: string;
  productId: null;
  productRefId: null;
  refId: string;
  ean: string;
  name: string;
  skuName: null;
  modalType: null;
  parentItemIndex: null;
  parentAssemblyBinding: null;
  assemblies: any[];
  priceValidUntil: null;
  tax: number;
  price: number;
  listPrice: null;
  manualPrice: null;
  manualPriceAppliedBy: null;
  sellingPrice: number;
  rewardValue: number;
  isGift: boolean;
  additionalInfo: AdditionalInfo;
  preSaleDate: null;
  productCategoryIds: null;
  productCategories: AvailableAssociations;
  quantity: number;
  seller: null;
  sellerChain: null[];
  imageUrl: null;
  detailUrl: null;
  components: any[];
  bundleItems: any[];
  attachments: any[];
  attachmentOfferings: any[];
  offerings: any[];
  priceTags: PriceTag[];
  availability: null;
  measurementUnit: string;
  unitMultiplier: number;
  manufacturerCode: null;
  priceDefinition: PriceDefinition;
}

export interface PriceDefinition {
  calculatedSellingPrice: number;
  total: number;
  sellingPrices: SellingPrice[];
}

export interface SellingPrice {
  value: number;
  quantity: number;
}

export interface PriceTag {
  name: string;
  value: number;
  rawValue: number;
  isPercentual: boolean;
  identifier: string;
}

export interface AvailableAssociations {}

export interface MarketingData {
  utmSource: string;
  utmMedium: null;
  utmCampaign: string;
  utmipage: null;
  utmiPart: null;
  utmiCampaign: null;
  coupon: null;
  marketingTags: string[];
}

export interface PaymentData {
  updateStatus: string;
  installmentOptions: InstallmentOption[];
  paymentSystems: PaymentSystem[];
  payments: any[];
  giftCards: any[];
  giftCardMessages: any[];
  availableAccounts: any[];
  availableTokens: any[];
  availableAssociations: AvailableAssociations;
}

export interface InstallmentOption {
  paymentSystem: string;
  bin: null;
  paymentName: null;
  paymentGroupName: null;
  value: number;
  installments: Installment[];
}

export interface Installment {
  count: number;
  hasInterestRate: boolean;
  interestRate: number;
  value: number;
  total: number;
  sellerMerchantInstallments?: Installment[];
  id?: ID;
}

export enum ID {
  Carrefourbrfood = "CARREFOURBRFOOD",
}

export interface PaymentSystem {
  id: number;
  name: string;
  groupName: string;
  validator: Validator;
  stringId: string;
  template: string;
  requiresDocument: boolean;
  displayDocument: boolean;
  isCustom: boolean;
  description: null | string;
  requiresAuthentication: boolean;
  dueDate: Date;
  availablePayments: null;
}

export interface Validator {
  regex: null | string;
  mask: null | string;
  cardCodeRegex: CardCodeRegex | null;
  cardCodeMask: null | string;
  weights: number[] | null;
  useCvv: boolean;
  useExpirationDate: boolean;
  useCardHolderName: boolean;
  useBillingAddress: boolean;
}

export enum CardCodeRegex {
  The093$ = "^[0-9]{3}$",
  The094$ = "^[0-9]{4}$",
}

export interface RatesAndBenefitsData {
  rateAndBenefitsIdentifiers: RateAndBenefitsIdentifier[];
  teaser: any[];
}

export interface RateAndBenefitsIdentifier {
  id: string;
  name: string;
  featured: boolean;
  description: string;
  matchedParameters: MatchedParameters;
  additionalInfo: null;
}

export interface MatchedParameters {
  "productCluster@CatalogSystem"?: string;
  "Seller@CatalogSystem"?: string;
  "zipCode@Shipping"?: string;
  slaIds?: string;
}

export interface Seller {
  id: string;
  name: string;
  logo: string;
}

export interface ShippingData {
  address: Address;
  logisticsInfo: LogisticsInfo[];
  selectedAddresses: Address[];
  availableAddresses: Address[];
  pickupPoints: PickupPoint[];
}

export interface Address {
  addressType: AddressType;
  receiverName: null;
  addressId: AddressID;
  isDisposable: boolean;
  postalCode: string;
  city: City;
  state: State;
  country: CountryCode;
  street: Street;
  number: null | string;
  neighborhood: Neighborhood;
  complement: null | string;
  reference: null;
  geoCoordinates: number[];
}

export enum AddressID {
  Rjs = "RJS",
  The71Cc3C13033144B0B2D4C01F6439A137 = "71cc3c13033144b0b2d4c01f6439a137",
}

export enum AddressType {
  Pickup = "pickup",
  Residential = "residential",
}

export enum City {
  RioDeJaneiro = "Rio de Janeiro",
}

export enum CountryCode {
  Bra = "BRA",
}

export enum Neighborhood {
  Botafogo = "Botafogo",
  Cachambi = "Cachambi ",
}

export enum State {
  Rj = "RJ",
}

export enum Street {
  AvenidaDOMHélderCâmara = "Avenida Dom Hélder Câmara",
  PraiaBotafogo = "Praia Botafogo",
}

export interface LogisticsInfo {
  itemIndex: number;
  selectedSla: SelectedSla;
  selectedDeliveryChannel: SelectedDeliveryChannel;
  addressId: AddressID;
  slas: Sla[];
  shipsTo: CountryCode[];
  itemId: string;
  deliveryChannels: DeliveryChannel[];
}

export interface DeliveryChannel {
  id: SelectedDeliveryChannel;
}

export enum SelectedDeliveryChannel {
  Delivery = "delivery",
  PickupInPoint = "pickup-in-point",
}

export enum SelectedSla {
  ClickRetireRJS = "Click & Retire (RJS)",
  Normal = "Normal",
}

export interface Sla {
  id: SelectedSla;
  deliveryChannel: SelectedDeliveryChannel;
  name: SelectedSla;
  deliveryIds: DeliveryID[];
  shippingEstimate: ShippingEstimate;
  shippingEstimateDate: null;
  lockTTL: null;
  availableDeliveryWindows: AvailableDeliveryWindow[];
  deliveryWindow: null;
  price: number;
  listPrice: number;
  tax: number;
  pickupStoreInfo: PickupStoreInfo;
  pickupPointId: null | string;
  pickupDistance: number | null;
  polygonName: string;
  transitTime: TransitTime;
}

export interface AvailableDeliveryWindow {
  startDateUtc: Date;
  endDateUtc: Date;
  price: number;
  lisPrice: number;
  tax: number;
}

export interface DeliveryID {
  courierId: CourierID;
  warehouseId: WarehouseID;
  dockId: DockID;
  courierName: CourierName;
  quantity: number;
  kitItemDetails: any[];
}

export enum CourierID {
  Normal111 = "Normal_111",
  R111 = "R_111",
}

export enum CourierName {
  NormalRJS = "Normal RJS",
  RetireRJS = "Retire RJS",
}

export enum DockID {
  D111 = "D_111",
}

export enum WarehouseID {
  The111_2 = "111_2",
}

export interface PickupStoreInfo {
  isPickupStore: boolean;
  friendlyName: null | string;
  address: Address | null;
  additionalInfo: null | string;
  dockId: null;
}

export enum ShippingEstimate {
  The0Bd = "0bd",
  The1M = "1m",
}

export enum TransitTime {
  The0Bd = "0bd",
  The198333333333333M = "1,98333333333333m",
}

export interface PickupPoint {
  friendlyName: string;
  address: Address;
  additionalInfo: string;
  id: string;
  businessHours: BusinessHour[];
}

export interface BusinessHour {
  DayOfWeek: number;
  OpeningTime: string;
  ClosingTime: string;
}

export interface StorePreferencesData {
  countryCode: CountryCode;
  saveUserData: boolean;
  timeZone: string;
  currencyCode: string;
  currencyLocale: number;
  currencySymbol: string;
  currencyFormatInfo: CurrencyFormatInfo;
}

export interface CurrencyFormatInfo {
  currencyDecimalDigits: number;
  currencyDecimalSeparator: string;
  currencyGroupSeparator: string;
  currencyGroupSize: number;
  startsWithCurrencySymbol: boolean;
}

export interface Totalizer {
  id: string;
  name: string;
  value: number;
  alternativeTotals?: Totalizer[];
}

export interface Installment {
  Value: number;
  InterestRate: number;
  NumberOfInstallments: number;
}

interface PriceRange {
  highPrice: number;
  lowPrice: number;
}

// Partial Product
export interface VTEXProduct {
  productId: string;
  productName: string;
  description: string;
  brand: string;
  productReference: number;
  linkText: string;
  // nome_produto: string[];
  // Atributos_Especiais: string[];
  categories: string[];
  // Descricao_Produto: string[]
  items: Item[];
  priceRange: {
    sellingPrice: PriceRange;
    listPrice: PriceRange;
  };
  // Custom/Common attrs
  Cor?: string[];
}

export interface Item {
  sellers: Seller[];
  images: Image[];
  itemId: string;
  name: string;
  nameComplete: string;
  complementName: string;
  referenceId: ReferenceID[];
  measurementUnit: string;
  unitMultiplier: number;
  variations: Variation[];
  ean: string;
  modalType: string;
  videos: any[];
  attachments: any[];
  isKit: boolean;
  Tamanho: string[];
}

export interface Image {
  imageId: string;
  cacheId: string;
  imageTag: string;
  imageLabel: string;
  imageText: string;
  imageUrl: string;
}

export interface ReferenceID {
  Key: string;
  Value: string;
}

export interface Seller {
  sellerId: string;
  sellerName: string;
  addToCartLink: string;
  sellerDefault: boolean;
  commertialOffer: CommertialOffer;
}

export interface CommertialOffer {
  DeliverySlaSamplesPerRegion: DeliverySlaSamplesPerRegion;
  DeliverySlaSamples: any[];
  AvailableQuantity: number;
  discountHighlights: any[];
  Installments: Installment[];
  Price: number;
  ListPrice: number;
  spotPrice: number;
  taxPercentage: number;
  PriceWithoutDiscount: number;
  Tax: number;
  GiftSkuIds: any[];
  BuyTogether: any[];
  ItemMetadataAttachment: any[];
  RewardValue: number;
  PriceValidUntil: Date;
  GetInfoErrorMessage: null;
  CacheVersionUsedToCallCheckout: string;
  teasers: any[];
}

export interface DeliverySlaSamplesPerRegion {}

export interface Installment {
  PaymentSystemName: string;
  Value: number;
  InterestRate: number;
  TotalValuePlusInterestRate: number;
  NumberOfInstallments: number;
  Name: string;
}

export interface Variation {
  name: string;
  values: string[];
}