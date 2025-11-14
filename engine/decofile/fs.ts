import { debounce } from "@std/async/debounce";
import { equal } from "@std/assert/equal";
import { extname } from "@std/path";
import { join } from "@std/path";
import { decompress } from "npm:brotli@1.3.3";
import { exists } from "../../utils/filesystem.ts";
import { stringifyForWrite } from "../../utils/json.ts";
import { getDecofileJSONFromDecofile } from "./json.ts";
import type {
  Decofile,
  DecofileProvider,
  OnChangeCallback,
  ReadOptions,
} from "./provider.ts";
import type { VersionedDecofile } from "./realtime.ts";

const copyFrom = (appName: string): Promise<Record<string, unknown>> => {
  return fetch(`https://${appName.replace("/", "-")}.deno.dev/live/release`)
    .then((response) => response.json() as Promise<Record<string, unknown>>)
    .catch((
      _e,
    ) => ({} as Record<string, unknown>));
};

const readAndDecompressFile = async (filePath: string): Promise<Decofile> => {
  const ext = extname(filePath);

  if (ext === ".bin") {
    // Read as text (base64 encoded), decode, and decompress with brotli
    const base64Content = await Deno.readTextFile(filePath);
    const compressedData = Uint8Array.from(
      atob(base64Content),
      (c) => c.charCodeAt(0),
    );
    const decompressed = decompress(compressedData);
    const textDecoder = new TextDecoder();
    const jsonString = textDecoder.decode(decompressed);
    return JSON.parse(jsonString) as Decofile;
  } else {
    // Regular JSON file
    return Deno.readTextFile(filePath).then((text) =>
      JSON.parse(text) as Decofile
    );
  }
};

export const DECO_FILE_NAME = ".decofile.json";

export const newFsProviderFromPath = (
  fullPath: string,
  appName?: string,
): DecofileProvider => {
  const onChangeCbs: OnChangeCallback[] = [];
  let previousState: unknown = null;

  const doUpdateState = async () => {
    const state = await readAndDecompressFile(fullPath)
      .catch((_e) => null);
    if (state === null) {
      return;
    }
    // Only update and notify if the state has actually changed
    if (equal(state, previousState)) {
      return;
    }
    previousState = state;
    decofile = Promise.resolve({
      state,
      revision: `${Date.now()}`,
    });
    for (const cb of onChangeCbs) {
      cb();
    }
  };

  const updateState = debounce(doUpdateState, 300);
  const copyDecoState = !appName ? Promise.resolve({}) : copyFrom(appName);
  let decofile: Promise<VersionedDecofile> = exists(fullPath, {
    isFile: true,
    isReadable: true,
  }).then(
    async (exists) => {
      if (!exists) {
        const data = getDecofileJSONFromDecofile(await copyDecoState, appName);
        return Deno.writeTextFile(
          fullPath,
          stringifyForWrite(data),
        ).then(() => {
          previousState = data;
          return { state: data, revision: `${Date.now()}` };
        });
      }
      const state = await readAndDecompressFile(fullPath);
      previousState = state;
      return {
        state,
        revision: `${Date.now()}`,
      };
    },
  ).then((result) => {
    (async () => {
      const watcher = Deno.watchFs(fullPath);
      for await (const _event of watcher) {
        updateState();
      }
    })();

    return result;
  });

  const state = async (options: ReadOptions | undefined) => {
    if (options?.forceFresh) {
      return readAndDecompressFile(fullPath);
    }

    return await decofile.then((r) => r.state);
  };

  return {
    state,
    notify: async () => {
      // Directly check for updates without debounce
      // This is important for environments where Deno.watchFs doesn't work (e.g., tempfs)
      await doUpdateState();
    },
    set: (state, rev) => {
      previousState = state;
      decofile = Promise.resolve({
        state,
        revision: rev ?? `${Date.now()}`,
      });
      for (const cb of onChangeCbs) {
        cb();
      }
      return Promise.resolve();
    },
    onChange: (cb: OnChangeCallback) => {
      onChangeCbs.push(cb);
      return {
        [Symbol.dispose]: () => {
          onChangeCbs.splice(onChangeCbs.indexOf(cb), 1);
        },
      };
    },
    revision: () => decofile.then((r) => r.revision),
  };
};
export const newFsProvider = (
  path = DECO_FILE_NAME,
  appName?: string,
): DecofileProvider => {
  const fullPath = join(Deno.cwd(), path);
  return newFsProviderFromPath(fullPath, appName);
};
