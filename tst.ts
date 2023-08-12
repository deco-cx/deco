import { parsePath } from "./engine/schema/swc/swc.ts";
import { programToSchemeable } from "$live/engine/schema/swc/transform.ts";

const start = performance.now();
await parsePath(import.meta.resolve("$live/loaders/state.ts"))
  .then((p) => programToSchemeable("./loaders/state.ts", p!));
console.log(performance.now() - start);

await parsePath(import.meta.resolve("./tsts.ts"))
  .then((p) => programToSchemeable("./tsts.ts", p!)).then(
    (resp) => {
      console.log(JSON.stringify(resp));
    },
  );
