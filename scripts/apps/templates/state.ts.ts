import { format } from "../../../utils/formatter.ts";
import { InitContext } from "../init.ts";

export default async function State(_init: InitContext) {
  return await format(
    `
        export interface State {
            url: string
        }
        `,
  );
}
