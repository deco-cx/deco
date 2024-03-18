import { parse } from "std/flags/mod.ts";
import * as colors from "std/fmt/colors.ts";
import { ensureDir } from "std/fs/ensure_dir.ts";
import { dirname, join } from "std/path/mod.ts";

export interface MountParams {
  vol?: string;
  fs?: {
    rm: (path: string) => Promise<void>;
    write: (path: string, content: string) => Promise<void>;
  };
}

export interface File {
  content: string | null;
}

export type FS = Record<string, File>;

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
    const data: FS = JSON.parse(decodeURIComponent(event.data));
    for (const [path, { content }] of Object.entries(data)) {
      if (["/deno.json", "/fresh.config.ts"].includes(path)) {
        continue;
      }
      if (!content) {
        console.log(colors.brightRed(`[d]~ ${path}`));
        await fs.rm(path);
      } else {
        console.log(colors.brightBlue(`[w]~ ${path}`));
        await fs.write(path, content);
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
  rm: (path) => Deno.remove(join(target, path)),
  write: async (path, content) => {
    const fullPath = join(target, path);
    await ensureDir(dirname(fullPath));
    await Deno.writeTextFile(fullPath, content);
  },
});
if (import.meta.main) {
  mount({});
}
