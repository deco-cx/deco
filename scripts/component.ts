import { HTMLtoJSX } from "../lib/htmltopreact.js";
import { format } from "../dev.ts";
import clipboard from "https://deno.land/x/clipboard@v0.0.2/mod.ts";

if (Deno.args.length < 1) {
  console.error(
    "Copy some HTML to your clipboard and run this script passing the name as first argument:\n\t%cdeno task component MyComponent",
    "color: red; font-weight: bold",
  );
  Deno.exit(1);
}

// Get component name from first argument
const name = Deno.args[0] || "Component";
// Get component html from clipboard
const raw = await clipboard.readText();
// Convert to JSX
const result = (new HTMLtoJSX({ name })).convert(raw);
const formatted = await format(result);
// Try to create /components folder, ignore if already exists
try {
  await Deno.mkdir("./components");
} catch (e) {
  if (!(e instanceof Deno.errors.AlreadyExists)) {
    console.error(e);
  }
}
const outputPath = `./components/${name}.tsx`;
const importSnippet = `import ${name} from '../components/${name}.tsx';\n`;
// Write the component
await Deno.writeTextFile(outputPath, formatted);
// Copy import snippet to clipboard
clipboard.writeText(importSnippet);

console.log(
  `Component created at %c${outputPath}`,
  "color: blue; font-weight: bold",
);
console.log(
  `Import in a route with:\n\n\t%c${importSnippet}`,
  "color: green; font-weight: bold",
);
console.log("For your convenience, this snippet was copied to your clipboard.");
