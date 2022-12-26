const CURRENT_ESM_VER = "100";

export async function orderImports() {
  const importMapFile = await Deno.readTextFile("./import_map.json");
  const importMap = JSON.parse(importMapFile);

  // Pin all esm deps to same cdn version
  for (const key of Object.keys(importMap.imports)) {
    const value = importMap.imports[key as keyof typeof importMap.imports];
    const isEsm = value.startsWith("https://esm.sh/");

    if (isEsm) {
      importMap.imports[key as keyof typeof importMap.imports] = value.replace(
        /https:\/\/esm.sh\/(v.\d*\/)?/,
        `https://esm.sh/v${CURRENT_ESM_VER}/`,
      );
    }
  }

  const imports = Object.entries(importMap.imports) as [string, string][];
  imports.sort(([_, a], [__, b]) => a.localeCompare(b));
  const newImports: Record<string, string> = {};
  for (const [key, value] of imports) {
    newImports[key] = value;
  }
  const newImportMap = { imports: newImports };
  await Deno.writeTextFile(
    "./import_map.json",
    JSON.stringify(newImportMap, null, 2),
  );
}

console.log(
  "Ordering import_map.json and pinning esm.sh version to",
  CURRENT_ESM_VER,
);
await orderImports();
