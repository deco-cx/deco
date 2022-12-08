import type { BreadcrumbList, Product } from "./schema-org.types.ts";

export interface ProductPage {
  breadcrumbList: BreadcrumbList;
  product: Product;
}

export interface ProductList {
  product: Product[];
}
