import { format } from "../../../utils/formatter.ts";
import { InitContext } from "../init.ts";

export default async function Deco(_ctx: InitContext) {
  return await format(
    `
    import type { App, AppContext as AC } from "$live/mod.ts";
    import manifest, { Manifest, name } from "./manifest.gen.ts";
    export { manifest, name };
    
    export interface State {
      url: string;
    }
    // you can freely add dependencies by just importing the app mod and put here
    export const dependencies = [];
    /**
     * @title App
     */
    export default function App(
      state: State,
    ): App<State> {
      return {
        state,
      };
    }
    
    export type AppContext = AC<State, Manifest, typeof dependencies>;
`,
  );
}
