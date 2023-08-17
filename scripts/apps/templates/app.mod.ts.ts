import { format } from "../../../utils/formatter.ts";
import { InitContext } from "../init.ts";

export default async function Deco(_ctx: InitContext) {
  return await format(
    `
    import { AppContext as AC } from "$live/blocks/app.ts";
    import manifest, { name } from "./manifest.gen.ts";
    import type { Manifest } from "./manifest.gen.ts";
    import type { App, FnContext } from "../deps.ts";

    export interface State {
      url: string;
    }
    export type MyApp = App<Manifest, State>;
    export default function App(
      state: State,
    ): MyApp {
      return {
        name,
        manifest,
        state,
      };
    }
    
    export type AppContext = AC<MyApp>;
`,
  );
}
