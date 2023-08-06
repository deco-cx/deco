import { format } from "../../../utils/formatter.ts";
import { InitContext } from "../init.ts";

export default async function Deco(_ctx: InitContext) {
  return await format(
    `
import manifest, { name } from "./manifest.gen.ts";
import type { Manifest } from "./manifest.gen.ts";
export { name };
import type { App, AppContext as AC } from "../deps.ts";

export interface State {
  url: string;
}
export default function App(
  state: State,
): App<Manifest, State> {
  return {
    manifest,
    state,
  };
}

export type AppContext = AC<ReturnType<typeof App>>;
`,
  );
}
