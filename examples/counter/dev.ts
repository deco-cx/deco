#!/usr/bin/env -S deno run -A --watch=static/
import { dev } from "$deco/dev.ts";

await dev(import.meta.url, "./prod.ts", () => {
  console.log("Render test URL: http://localhost:8080/test");
});
