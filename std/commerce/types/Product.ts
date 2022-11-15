export interface Image {
  src: string;
  alt?: string;
}

export interface Product {
  productId: string;
  id: string;
  name: string;
  sellerId: string;
  price: number;
  listPrice: number;
  installments: string;
  image: Image;
  imageHover?: Image;
  images: Image[];
  slug: string;
  brand: string;
  description: string;
  // atributos: string;
  // nome_produto: string;
  breadcrumb: Array<{ label: string; url: string }>;
  specifications: Record<string, string>;
  skuOptions: Array<{ variationValue: string; skuUrl: string }>;
  color?: string;
}
