import { assertEquals } from "@std/assert";
import { singleFlight } from "../../engine/core/utils.ts";
import { runWithExecutionContext } from "./context.ts";

const ctx = () => ({ waitUntil: (_: Promise<unknown>) => {} });

/** A call that stays pending until released, counting how often it ran. */
function gate() {
  let calls = 0;
  let release!: (v: string) => void;
  const pending = new Promise<string>((r) => (release = r));
  return {
    f: () => {
      calls++;
      return pending;
    },
    calls: () => calls,
    release: (v: string) => release(v),
  };
}

Deno.test("singleFlight joins calls of the same request on workerd", async () => {
  const sf = singleFlight<string>();
  const g = gate();
  const request = ctx();
  const [a, b] = runWithExecutionContext(request, () => [
    sf.do("k", g.f),
    sf.do("k", g.f),
  ]);
  g.release("v");
  assertEquals(await Promise.all([a, b]), ["v", "v"]);
  assertEquals(g.calls(), 1);
});

Deno.test("singleFlight never joins another request's call on workerd", async () => {
  const sf = singleFlight<string>();
  const g = gate();
  const a = runWithExecutionContext(ctx(), () => sf.do("k", g.f));
  const b = runWithExecutionContext(ctx(), () => sf.do("k", g.f));
  g.release("v");
  assertEquals(await Promise.all([a, b]), ["v", "v"]);
  assertEquals(g.calls(), 2);
});

Deno.test("singleFlight still dedupes across callers outside a request (Deno)", async () => {
  const sf = singleFlight<string>();
  const g = gate();
  const a = sf.do("k", g.f);
  const b = sf.do("k", g.f);
  g.release("v");
  assertEquals(await Promise.all([a, b]), ["v", "v"]);
  assertEquals(g.calls(), 1);
});

Deno.test("a settled flight is dropped, per request", async () => {
  const sf = singleFlight<number>();
  let n = 0;
  const request = ctx();
  const first = await runWithExecutionContext(
    request,
    () => sf.do("k", () => Promise.resolve(++n)),
  );
  const second = await runWithExecutionContext(
    request,
    () => sf.do("k", () => Promise.resolve(++n)),
  );
  assertEquals([first, second], [1, 2]);
});

Deno.test("every copy of this module shares the request (entry + app bundle)", async () => {
  // The Worker entry and the site bundle each embed this module; the app copy
  // is evaluated last and must still see the request the entry runs.
  const copy: typeof import("./context.ts") = await import(
    "./context.ts?copy=app"
  );
  const scope = () =>
    (globalThis as unknown as Record<symbol, () => unknown>)[
      Symbol.for("deco.requestScope")
    ]();
  const kept: Promise<unknown>[] = [];
  const request = { waitUntil: (p: Promise<unknown>) => void kept.push(p) };
  runWithExecutionContext(request, () => {
    assertEquals(scope(), request);
    copy.waitUntil(Promise.resolve());
  });
  assertEquals(kept.length, 1);
  assertEquals(scope(), undefined);

  const sf = singleFlight<string>();
  const g = gate();
  const a = runWithExecutionContext(ctx(), () => sf.do("k", g.f));
  const b = copy.runWithExecutionContext(ctx(), () => sf.do("k", g.f));
  g.release("v");
  assertEquals(await Promise.all([a, b]), ["v", "v"]);
  assertEquals(g.calls(), 2);
});
