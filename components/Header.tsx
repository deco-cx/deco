import { Section as SCV } from "$live/blocks/section.ts";
import { Product } from "./products.ts";

export interface Props {
  a: number;
  products: Product[];
}
export const Header = (p: Props): SCV => {
  return <div></div>;
};
