import { parse } from "std/flags/mod.ts";
import * as colors from "std/fmt/colors.ts";
import { ensureDir } from "std/fs/ensure_dir.ts";
import { dirname, join } from "std/path/mod.ts";

const { vol, ...args } = parse(Deno.args, {
  string: ["vol", "dir"],
});

if (!vol) {
  console.error(colors.red("--vol arg is required"));
  Deno.exit(1);
}

const target = args.dir ?? Deno.cwd();

console.info(colors.green(`connecting ${vol} -> ${target}`));
const eventSource = new EventSource(vol);

eventSource.onopen = () => {
  console.log(colors.green(`mount server succesfully connected!`));
};

eventSource.onerror = (error) => {
  console.error(colors.red(`mount server error`), error);
};

interface File {
  content: string | null;
}

type FS = Record<string, File>;

eventSource.onmessage = async (event) => {
  const data: FS = JSON.parse(decodeURIComponent(event.data));
  for (const [path, { content }] of Object.entries(data)) {
    const fullPath = join(target, path);
    await ensureDir(dirname(fullPath));
    if (!content) {
      console.log(colors.brightRed(`[d]~ ${fullPath}`));
      await Deno.remove(fullPath).catch((_err) => {});
    } else {
      console.log(colors.brightBlue(`[w]~ ${fullPath}`));
      await Deno.writeTextFile(fullPath, content);
    }
  }
};
