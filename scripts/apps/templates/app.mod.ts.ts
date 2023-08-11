import { format } from "../../../utils/formatter.ts";
import { InitContext } from "../init.ts";

export default async function Deco(_ctx: InitContext) {
  return await format(
    `
    import manifest, { name } from "./manifest.gen.ts";
    import type { Manifest } from "./manifest.gen.ts";
    import type { App, FnContext } from "../deps.ts";

    export interface State {
      url: string;
    }
    export default function App(
      state: State,
    ): App<Manifest, State> {
      return {
        name,
        manifest,
        state,
      };
    }
    
    export type AppContext = FnContext<State, Manifest>;
`,
  );
}
