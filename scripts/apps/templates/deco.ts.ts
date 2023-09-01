import { format } from "../../../utils/formatter.ts";
import type { InitContext } from "../init.ts";

export default async function Deco({ appName }: InitContext) {
  return await format(
    `const apps = [{
        dir: "./app",
        name: "${appName}",
      }];
      
      const config = {
          apps,
      }
      
      export default config;`,
  );
}
