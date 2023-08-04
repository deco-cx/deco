import { InitContext } from "$live/scripts/apps/init.ts";
import { format } from "$live/dev.ts";

export default async function State(_init: InitContext) {
  return await format(
    `
        export interface State {
            url: string
        }
        `,
  );
}
