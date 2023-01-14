import { get } from "https://deno.land/x/deconfig/deconfig.ts";

export interface Props {
  id: string;
}

export interface Config {
  account: string;
}

const shopify = get<Config>("accounts/shopify");

export default function ShopifyProductLoader(props: Props, req: Request) {
  console.log("ShopifyProductLoader", props, req);
  return {
    id: props.id,
  };
}
