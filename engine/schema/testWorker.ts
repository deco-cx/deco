import { deferred } from "std/async/deferred.ts";

const worker = new Worker(
  new URL("./denodoc_worker.ts", import.meta.url).href,
  {
    type: "module",
  },
);

const s = deferred();
worker.postMessage(import.meta.resolve("./gen.ts"));

worker.addEventListener("message", (msg) => {
  console.log(msg);
  s.resolve();
});

const ss = await s;

console.log(ss);
