import { parse } from "std/flags/mod.ts";
import * as colors from "std/fmt/colors.ts";
import { ensureDir } from "std/fs/ensure_dir.ts";
import { dirname, join } from "std/path/mod.ts";
import { DenoFs, IVFS } from "../runtime/fs/mod.ts";

export interface MountParams {
  vol?: string;
  fs?: IVFS;
}

export interface MountPoint {
  unmount: () => void;
  onUnmount?: () => void;
  onReady?: () => void;
}
export interface File {
  content: string | null;
}

const MAX_RETRIES_NO_RECONNECT = 10;
export type FileSystem = Record<string, File>;
const mountWS = (vol: string, fs: IVFS): MountPoint => {
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
      const data: FileSystemEvent = JSON.parse(event.data);
      await sync(data, fs);
    };
  };

  connect();

  return {
    unmount() {
      disposed = true;
      websocket.close();
    },
  };
};

const mountES = (vol: string, fs: IVFS): MountPoint => {
  let disposed = false;
  let es: EventSource = new EventSource(vol);
  let currentConnectTimeout: number | undefined = undefined;
  let retries = MAX_RETRIES_NO_RECONNECT;
  let ready: undefined | (() => void) = undefined;

  const connect = () => {
    let firstMount = true;
    es.onopen = () => {
      retries = MAX_RETRIES_NO_RECONNECT;
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
      if (retries <= 0) {
        unmount();
        console.log("retries exhausted, closing connection");
        return;
      }
      retries--;
      console.log("retrying, remaining:", retries);
      es.close();
      currentConnectTimeout && clearTimeout(currentConnectTimeout);
      es = new EventSource(vol);
      currentConnectTimeout = setTimeout(connect, 1000);
    };

    es.onmessage = async (event) => {
      const data: FileSystemEvent = JSON.parse(decodeURIComponent(event.data));
      await sync(data, fs);
      firstMount ? ready?.() : (firstMount = false);
    };
  };

  connect();

  let onUnmount: undefined | (() => void) = undefined;
  function unmount() {
    disposed = true;
    es.close();
    onUnmount?.();
  }
  return {
    set onUnmount(value) {
      onUnmount = value;
      if (disposed) {
        value?.();
      }
    },
    set onReady(value) {
      ready = value;
    },
    get onUnmount() {
      return onUnmount;
    },
    get onReady() {
      return ready;
    },
    unmount,
  };
};

export const mount = (params: MountParams): MountPoint => {
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

export interface FileSystemResponse {
  fs: FileSystem;
  timestamp: number;
}
export type FileSystemEvent = FileSystem | FileSystemResponse;

const isFsResponse = (fs: FileSystemEvent): fs is FileSystemResponse => {
  return (fs as FileSystemResponse).timestamp !== undefined;
};
async function sync(data: FileSystemEvent, fs: IVFS) {
  const [fileSystem, ts] = isFsResponse(data)
    ? [data.fs, data.timestamp]
    : [data, Date.now()];
  for (const [path, { content }] of Object.entries(fileSystem)) {
    if (!content) {
      console.log(colors.brightRed(`[d]~ ${path}`));
      await fs.remove(path);
    } else {
      console.log(colors.brightBlue(`[w]~ ${path}`));
      await fs.writeTextFile(path, content);
    }
  }
  fs.lastWrite = ts;
}

if (import.meta.main) {
  mount({});
}
