// Detailed investigation of runtime imports

console.log("🔍 Detailed runtime import investigation...\n");

console.log("Testing runtime components individually:\n");

// Test 1: Just deps
let start = performance.now();
await import("./runtime/deps.ts");
console.log(`runtime/deps.ts: ${(performance.now() - start).toFixed(2)}ms`);

// Test 2: middleware
start = performance.now();
await import("./runtime/middleware.ts");
console.log(`runtime/middleware.ts: ${(performance.now() - start).toFixed(2)}ms`);

// Test 3: Each route individually
const routes = [
  "_meta",
  "batchInvoke",
  "blockPreview",
  "entrypoint",
  "inspect",
  "invoke",
  "previews",
  "release",
  "reload",
  "render",
  "styles.css",
  "workflow",
];

console.log("\n=== Testing individual routes ===\n");

for (const route of routes) {
  const ext = route === "styles.css" ? ".ts" : route.startsWith("block") || route.startsWith("render") || route.startsWith("preview") || route.startsWith("entrypoint") ? ".tsx" : ".ts";
  const path = `./runtime/routes/${route}${ext}`;

  try {
    start = performance.now();
    await import(path);
    const time = performance.now() - start;
    const indicator = time > 1000 ? "🔴" : time > 500 ? "🟡" : time > 100 ? "🟠" : "🟢";
    console.log(`${indicator} ${path.padEnd(45)} ${time.toFixed(2).padStart(10)}ms`);
  } catch (err) {
    console.log(`❌ ${path.padEnd(45)} ERROR: ${err.message}`);
  }
}

// Test 4: Full handler
console.log("\n=== Testing full runtime/handler.tsx ===\n");
start = performance.now();
await import("./runtime/handler.tsx");
const handlerTime = performance.now() - start;
console.log(`runtime/handler.tsx: ${handlerTime.toFixed(2)}ms`);

console.log("\n✅ Investigation complete");
