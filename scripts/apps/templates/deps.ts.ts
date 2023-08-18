import { format } from "../../../utils/formatter.ts";
import { InitContext } from "../init.ts";

export default async function DepsTs({ decoVersion }: InitContext) {
  return await format(
    `export * from "https://denopkg.com/deco-cx/deco@${decoVersion}/mod.ts";`,
  );
}
