import type { VTEXConfig } from "deco/accounts/vtex.ts";

export interface Props {
  id: string;
  vtex: VTEXConfig;
}

export default function VTEXProductLoader(
  { id, vtex: { account } }: Props,
  req: Request,
) {
  console.log("VTEXProductLoader", id, account, req);
  return {
    id,
    account,
  };
}
