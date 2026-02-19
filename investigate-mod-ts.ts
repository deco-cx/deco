// Investigation: What makes mod.ts slow to load?
// This tests each import/export from mod.ts individually

console.log("🔍 Investigating mod.ts import chain...\n");

// Read mod.ts to understand what it exports
const modContent = await Deno.readTextFile("./mod.ts");
const importLines = modContent.split("\n").filter((line) =>
  line.trim().startsWith("export") && line.includes("from")
);

console.log(`Found ${importLines.length} export statements in mod.ts\n`);

// Test each import source
const imports = new Set<string>();
importLines.forEach((line) => {
  const match = line.match(/from ["'](.+?)["']/);
  if (match) imports.add(match[1]);
});

console.log("=== Testing individual imports from mod.ts ===\n");

const results: Array<{ path: string; time: number }> = [];

for (const importPath of Array.from(imports).sort()) {
  try {
    const start = performance.now();
    await import(importPath);
    const time = performance.now() - start;
    results.push({ path: importPath, time });

    const indicator = time > 1000 ? "🔴" : time > 500 ? "🟡" : time > 100 ? "🟠" : "🟢";
    console.log(`${indicator} ${importPath.padEnd(50)} ${time.toFixed(2).padStart(10)}ms`);
  } catch (err) {
    console.log(`❌ ${importPath.padEnd(50)} ERROR: ${err.message}`);
  }
}

// Summary
console.log("\n=== Summary ===\n");
const slow = results.filter((r) => r.time > 1000);
const medium = results.filter((r) => r.time > 500 && r.time <= 1000);
const warm = results.filter((r) => r.time > 100 && r.time <= 500);

if (slow.length > 0) {
  console.log(`🔴 Critical (>1s):`);
  slow.forEach((r) => console.log(`  - ${r.path}: ${r.time.toFixed(2)}ms`));
}

if (medium.length > 0) {
  console.log(`\n🟡 Slow (500ms-1s):`);
  medium.forEach((r) => console.log(`  - ${r.path}: ${r.time.toFixed(2)}ms`));
}

if (warm.length > 0) {
  console.log(`\n🟠 Warm (100ms-500ms):`);
  warm.forEach((r) => console.log(`  - ${r.path}: ${r.time.toFixed(2)}ms`));
}

const total = results.reduce((sum, r) => sum + r.time, 0);
console.log(`\nTotal time for all imports: ${total.toFixed(2)}ms`);
