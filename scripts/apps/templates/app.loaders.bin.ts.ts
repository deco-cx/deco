import { InitContext } from "$live/scripts/apps/init.ts";
import { format } from "$live/dev.ts";

export default async function AppLoadersBin(_init: InitContext) {
  return await format(
    `import { AppContext } from "../deco.app.ts";
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
