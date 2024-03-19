import { parse } from "std/flags/mod.ts";
import * as colors from "std/fmt/colors.ts";
import { ensureDir } from "std/fs/ensure_dir.ts";
import { dirname, join } from "std/path/mod.ts";
import { DenoFs, IVFS } from "../runtime/fs/mod.ts";

export interface MountParams {
  vol?: string;
  fs?: IVFS;
}

export interface File {
  content: string | null;
}

export type FileSystem = Record<string, File>;

export const mount = (params: MountParams): Disposable => {
  const { vol: codeVol, dir } = parse(Deno.args, {
    string: ["vol", "dir"],
  });
  const fs = params?.fs ?? defaultFs(dir);
  const vol = params?.vol ?? codeVol;
  if (!vol) {
    console.error(colors.red("--vol arg is required"));
    Deno.exit(1);
  }
  console.info(colors.green(`connecting ${vol}`));
  const eventSource = new EventSource(vol);

  eventSource.onopen = () => {
    console.log(colors.green(`mount server succesfully connected!`));
  };

  eventSource.onerror = (error) => {
    console.error(colors.red(`mount server error`), error);
  };

  eventSource.onmessage = async (event) => {
    const data: FileSystem = JSON.parse(decodeURIComponent(event.data));
    for (const [path, { content }] of Object.entries(data)) {
      if (["/deno.json"].includes(path)) {
        continue;
      }
      if (!content) {
        console.log(colors.brightRed(`[d]~ ${path}`));
        await fs.remove(path);
      } else {
        console.log(colors.brightBlue(`[w]~ ${path}`));
        await fs.writeTextFile(path, content);
      }
    }
  };
  return {
    [Symbol.dispose]() {
      eventSource.close();
    },
  };
};

export const defaultFs = (
  target = Deno.cwd(),
): Required<MountParams>["fs"] => ({
  ...DenoFs,
  mkdir: (path) =>
    DenoFs.mkdir(join(target, path.toString()), { recursive: true }),
  remove: (path) => DenoFs.remove(join(target, path.toString())),
  writeTextFile: async (path, content) => {
    const fullPath = join(target, path.toString());
    await ensureDir(dirname(fullPath));
    await DenoFs.writeTextFile(fullPath, content);
  },
});
if (import.meta.main) {
  mount({});
}
