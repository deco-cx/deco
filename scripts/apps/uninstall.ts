import { dev } from "./dev.ts";
await dev(Deno.args[1], Deno.cwd(), false, Deno.args[0]);
