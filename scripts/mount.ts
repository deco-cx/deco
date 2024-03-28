import { EventSourcePolyfill } from "npm:event-source-polyfill@1.0.31";
import { parse } from "std/flags/mod.ts";
import * as colors from "std/fmt/colors.ts";
import { ensureDir } from "std/fs/ensure_dir.ts";
import { dirname, join } from "std/path/mod.ts";
import { gte, parse as parseVer } from "std/semver/mod.ts";
import { DenoFs, IVFS } from "../runtime/fs/mod.ts";

const MIN_DENO_VERSION = parseVer("1.42.0");
const EventSourceImpl: new (url: string | URL) => EventSource =
  gte(parseVer(Deno.version.deno), MIN_DENO_VERSION)
    ? EventSource
    : EventSourcePolyfill;

export interface MountParams {
  vol?: string;
  fs?: IVFS;
}
Deno.version.deno;

export interface File {
  content: string | null;
}

export type FileSystem = Record<string, File>;
const mountWS = (vol: string, fs: IVFS): Disposable => {
  let disposed = false;
  let websocket = new WebSocket(vol);

  const connect = () => {
    websocket.onopen = () => {
      console.log(colors.green(`mount server ${vol} successfully connected!`));
    };

    websocket.onerror = (error) => {
      console.error(colors.red(`mount server error`), error);
    };

    websocket.onclose = () => {
      console.log(
        colors.yellow(`mount server ${vol} closed, disposed: ${disposed}`),
      );
      if (disposed) {
        return;
      }
      websocket = new WebSocket(vol);
      setTimeout(connect, 1000);
    };

    websocket.onmessage = async (event) => {
      const data: FileSystem = JSON.parse(event.data);
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
  };

  connect();

  return {
    [Symbol.dispose]() {
      disposed = true;
      websocket.close();
    },
  };
};

const mountES = (vol: string, fs: IVFS): Disposable => {
  let disposed = false;
  let es: EventSource = new EventSourceImpl(vol);

  const connect = () => {
    es.onopen = () => {
      console.log(colors.green(`mount server ${vol} successfully connected!`));
    };

    es.onerror = (error) => {
      console.error(
        colors.red(`mount server error trying to reconnect`),
        error,
      );
      if (disposed) {
        return;
      }
      es = new EventSourceImpl(vol);
      setTimeout(connect, 1000);
    };

    es.onmessage = async (event) => {
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
  };

  connect();

  return {
    [Symbol.dispose]() {
      disposed = true;
      es.close();
    },
  };
};

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
  const mountPoint = vol.startsWith("http") ? mountES : mountWS;
  return mountPoint(vol, fs);
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
