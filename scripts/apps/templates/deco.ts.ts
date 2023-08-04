import { InitContext } from "$live/scripts/apps/init.ts";
import { format } from "$live/dev.ts";

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
