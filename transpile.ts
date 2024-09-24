import { ensureDir } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";
import { walk } from "https://deno.land/std@0.224.0/fs/walk.ts";
import { extname, join } from "https://deno.land/std@0.224.0/path/mod.ts";
import { build } from "https://deno.land/x/esbuild@v0.24.0/mod.js";

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

    // Use esbuild to transpile the TSX file to JS
    const result = await build({
      entryPoints: [sourceFilePath],
      outfile: outputFilePath,
      write: true,
      bundle: false,
      format: "esm",
      target: ["esnext"],
      jsx: "preserve", // Handle JSX transformation,
      loader: { ".tsx": "tsx" }, // Preserve the TypeScript syntax
      jsxFactory: "React.createElement",
      jsxFragment: "React.Fragment",
      minify: false,
      sourcemap: true,
    });

    console.log(result);

    // Clean up after esbuild
  }
}

// Set the input and output directories
const inputDir = "."; // Directory containing .tsx files

// Transpile all TSX files
await transpileTSXToJS(inputDir, Deno.cwd());

console.log("Transpilation complete.");
