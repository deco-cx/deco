import { format } from "../../../utils/formatter.ts";
import { InitContext } from "../init.ts";

export default async function AppMod(_ctx: InitContext) {
  return await format(
    `
    import manifest from "./manifest.gen.ts";
    import type { Manifest } from "./manifest.gen.ts";
    import type { App, AppContext as AC } from "../deps.ts";

    export interface State {
      url: string;
    }
    export type MyApp = App<Manifest, State>;
    export default function App(
      state: State,
    ): MyApp {
      return {
        manifest,
        state,
      };
    }
    
    export type AppContext = AC<MyApp>;
`,
  );
}
