import { format } from "../../../utils/formatter.ts";
import type { InitContext } from "../init.ts";

export default async function AppLoadersBin(_init: InitContext) {
  return await format(
    `import { AppContext } from "../mod.ts";
    export interface Props {
      status: number;
    }
    export default function GetBin(
      { status }: Props,
      _req: Request,
      ctx: AppContext,
    ): Promise<Response> {
      return fetch(\`\${ctx.url}/\${status}\`);
    }`,
  );
}
