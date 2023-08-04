import { dev } from "./dev.ts";
await dev(Deno.args[1], Deno.cwd(), true, Deno.args[0]);
