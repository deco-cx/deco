export interface Image {
  src: string;
  alt?: string;
}

export interface Product {
  id: string;
  name: string;
  sellerId: string;
  price: number;
  installments: string;
  image: Image;
  imageHover?: Image;
  slug: string;
  brand: string;
  description: string;
  atributos: string;
  nome_produto: string;
  breadcrumb: Array<{ label: string; url: string }>;
}