// Detailed profiling of the import chain to find the real bottleneck

console.log("🔍 DETAILED IMPORT PROFILING\n");

async function timeImport(name: string, importFn: () => Promise<any>) {
  const start = performance.now();
  await importFn();
  const time = performance.now() - start;
  const indicator = time > 1000 ? "🔴" : time > 500 ? "🟡" : time > 100 ? "🟠" : "🟢";
  console.log(`${indicator} ${name.padEnd(50)} ${time.toFixed(2).padStart(10)}ms`);
  return time;
}

console.log("=== Core Dependencies ===\n");
await timeImport("@std/path", () => import("@std/path"));
await timeImport("preact", () => import("preact"));
await timeImport("preact/hooks", () => import("preact/hooks"));

console.log("\n=== Deco Core ===\n");
await timeImport("./deco.ts", () => import("./deco.ts"));
await timeImport("./types.ts", () => import("./types.ts"));

console.log("\n=== Engine ===\n");
await timeImport("./engine/block.ts", () => import("./engine/block.ts"));
await timeImport("./engine/core/resolver.ts", () => import("./engine/core/resolver.ts"));
await timeImport("./engine/manifest/utils.ts", () => import("./engine/manifest/utils.ts"));

console.log("\n=== Blocks (THE CRITICAL PATH) ===\n");
await timeImport("./blocks/app.ts", () => import("./blocks/app.ts"));
await timeImport("./blocks/loader.ts", () => import("./blocks/loader.ts"));
await timeImport("./blocks/handler.ts", () => import("./blocks/handler.ts"));
await timeImport("./blocks/matcher.ts", () => import("./blocks/matcher.ts"));
await timeImport("./blocks/action.ts", () => import("./blocks/action.ts"));
await timeImport("./blocks/workflow.ts", () => import("./blocks/workflow.ts"));

console.log("\n🔴 THE BIG ONE - blocks/section.ts:");
await timeImport("./blocks/section.ts", () => import("./blocks/section.ts"));

console.log("\n🔴 THE BIGGER ONE - blocks/page.tsx:");
await timeImport("./blocks/page.tsx", () => import("./blocks/page.tsx"));

console.log("\n🔴 THE FULL BLOCKS SYSTEM:");
await timeImport("./blocks/index.ts", () => import("./blocks/index.ts"));

console.log("\n=== Runtime ===\n");
await timeImport("./runtime/deps.ts", () => import("./runtime/deps.ts"));
await timeImport("./runtime/middleware.ts", () => import("./runtime/middleware.ts"));

console.log("\n🔴🔴🔴 THE MONSTER - runtime/handler.tsx:");
await timeImport("./runtime/handler.tsx", () => import("./runtime/handler.tsx"));

console.log("\n🔴 Full runtime/mod.ts:");
await timeImport("./runtime/mod.ts", () => import("./runtime/mod.ts"));

console.log("\n=== Complete ===");
