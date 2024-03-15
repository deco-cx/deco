import { parse } from "std/flags/mod.ts";
import * as colors from "std/fmt/colors.ts";
import { ensureDir } from "std/fs/ensure_dir.ts";
import { dirname, join } from "std/path/mod.ts";

export interface MountParams {
  vol: string;
  fs: {
    rm: (path: string) => Promise<void>;
    write: (path: string, content: string) => Promise<void>;
  };
}

export interface File {
  content: string | null;
}

export type FS = Record<string, File>;

export const mount = (params: MountParams) => {
  console.info(colors.green(`connecting ${params.vol}`));
  const eventSource = new EventSource(params.vol);

  eventSource.onopen = () => {
    console.log(colors.green(`mount server succesfully connected!`));
  };

  eventSource.onerror = (error) => {
    console.error(colors.red(`mount server error`), error);
  };

  eventSource.onmessage = async (event) => {
    const data: FS = JSON.parse(decodeURIComponent(event.data));
    for (const [path, { content }] of Object.entries(data)) {
      if (!content) {
        console.log(colors.brightRed(`[d]~ ${path}`));
        await params.fs.rm(path);
      } else {
        console.log(colors.brightBlue(`[w]~ ${path}`));
        await params.fs.write(path, content);
      }
    }
  };
};

export const defaultFs = (target = Deno.cwd()): MountParams["fs"] => ({
  rm: (path) => Deno.remove(join(target, path)),
  write: async (path, content) => {
    const fullPath = join(target, path);
    await ensureDir(dirname(fullPath));
    await Deno.writeTextFile(fullPath, content);
  },
});
if (import.meta.main) {
  const { vol, ...args } = parse(Deno.args, {
    string: ["vol", "dir"],
  });

  if (!vol) {
    console.error(colors.red("--vol arg is required"));
    Deno.exit(1);
  }

  mount({
    vol,
    fs: defaultFs(args.dir),
  });
}
