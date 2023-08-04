import { dev } from "./dev.ts";
await dev(Deno.args[1], Deno.args[0], true, Deno.cwd());
