import dev from "./dev.ts";

await dev(import.meta.url, "./main.ts", {});
