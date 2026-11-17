// deno-lint-ignore-file no-explicit-any
import { assertEquals } from "@std/assert";
import { installDenoShim } from "./deno.ts";

/**
 * Installs the shim as on workerd (no `Deno`, no `process`), returns it, and
 * restores the real globals.
 */
function shimmedDeno(): any {
  const g = globalThis as any;
  const hidden = ["Deno", "process"].map((name) =>
    [name, Object.getOwnPropertyDescriptor(g, name)!] as const
  );
  const addEventListener = g.addEventListener;
  for (const [name] of hidden) delete g[name];
  try {
    installDenoShim();
    return g.Deno;
  } finally {
    for (const [name, desc] of hidden) Object.defineProperty(g, name, desc);
    g.addEventListener = addEventListener;
  }
}

Deno.test("Deno.test and Deno.bench are no-ops, with .ignore and .only", () => {
  const shim = shimmedDeno();
  const fail = () => {
    throw new Error("must not run");
  };
  for (const run of [shim.test, shim.bench]) {
    assertEquals(run("x", fail), undefined);
    assertEquals(run.ignore("x", fail), undefined);
    assertEquals(run.only("x", fail), undefined);
  }
});
