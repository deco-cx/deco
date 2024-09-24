import { ensureDir } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";
import { walk } from "https://deno.land/std@0.224.0/fs/walk.ts";
import { extname, join } from "https://deno.land/std@0.224.0/path/mod.ts";
import { transpile } from "jsr:@deno/emit";

// Function to transpile TSX to JS using esbuild
async function transpileTSXToJS(inputDir: string, outputDir: string) {
  for await (
    const entry of walk(inputDir, { exts: [".tsx"], includeDirs: false })
  ) {
    const sourceFilePath = entry.path;
    const relativePath = sourceFilePath.replace(inputDir, ".");
    const outputFilePath = join(
      outputDir,
      relativePath.replace(`${extname(sourceFilePath)}`, ".js"),
    );

    console.log(
      `Transpiling ${sourceFilePath} to ${outputFilePath} `,
    );

    // Ensure the output directory exists
    console.log(
      "dist",
      join(outputDir, relativePath.split("/").slice(0, -1).join("/")),
    );
    await ensureDir(
      join(
        outputDir,
        relativePath.split("/").slice(0, -1).join("/"),
      ),
    );

    const url = new URL(sourceFilePath, import.meta.url);
    console.log(`file://${join(Deno.cwd(), "deno.json")}`);

    const result = await transpile(url, {
      allowRemote: true,
      compilerOptions: {
        "jsx": "react-jsx",
        "jsxImportSource": "preact",
      },
      importMap: join(Deno.cwd(), "deno.json"),
    });

    const code = result.get(url.href);

    const tsFile = url.href.replace(".tsx", ".ts");
    code && await Deno.writeTextFile(tsFile, code)

    // Clean up after esbuild
  }
}

// Set the input and output directories
const inputDir = "."; // Directory containing .tsx files

// Transpile all TSX files
await transpileTSXToJS(inputDir, Deno.cwd());

console.log("Transpilation complete.");
