import { Schemas } from "$live/engine/schema/builder.ts";
import { join } from "https://deno.land/std@0.61.0/path/mod.ts";

let schemas: Promise<Schemas> | null = null;

export const getCurrent = (): Promise<Schemas> => {
  return schemas ??= Deno.readTextFile(join(Deno.cwd(), "schemas.gen.json"))
    .then(
      JSON.parse,
    );
};
