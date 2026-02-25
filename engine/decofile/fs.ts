import { debounce } from "@std/async/debounce";
import { equal } from "@std/assert/equal";
import { extname } from "@std/path";
import { join } from "@std/path";
import { decompress } from "npm:brotli@1.3.3";
import { exists } from "../../utils/filesystem.ts";
import { stableStringify, stringifyForWrite } from "../../utils/json.ts";
import { MurmurHash3 } from "../../utils/hasher.ts";
import { getDecofileJSONFromDecofile } from "./json.ts";
import type {
  Decofile,
  DecofileProvider,
  OnChangeCallback,
  ReadOptions,
} from "./provider.ts";
import type { VersionedDecofile } from "./realtime.ts";

const hash = new MurmurHash3();

/**
 * Creates a stable hash of the decofile state.
 * This ensures all PODs with the same state have the same revision.
 * Uses stable stringification to guarantee consistent key ordering.
 */
const hashState = (state: Decofile): string => {
  const stateStr = stableStringify(state);
  hash.hash(stateStr);
  const result = hash.result();
  hash.reset();
  return `${result}`;
};

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
  // Synchronous cache for resolved state and revision — avoids .then() microtask overhead
  let cachedState: Decofile | null = null;
  let cachedRevision: string | null = null;

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
    const revision = hashState(state);
    cachedState = state;
    cachedRevision = revision;
    decofile = Promise.resolve({
      state,
      revision,
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
          const revision = hashState(data);
          cachedState = data;
          cachedRevision = revision;
          return { state: data, revision };
        });
      }
      const state = await readAndDecompressFile(fullPath);
      previousState = state;
      const revision = hashState(state);
      cachedState = state;
      cachedRevision = revision;
      return { state, revision };
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
    // Return cached value synchronously when available — avoids .then() microtask
    if (cachedState !== null) return cachedState;

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
      const revision = rev ?? hashState(state);
      cachedState = state;
      cachedRevision = revision;
      decofile = Promise.resolve({
        state,
        revision,
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
    revision: () => {
      // Return cached value synchronously when available
      if (cachedRevision !== null) return Promise.resolve(cachedRevision);
      return decofile.then((r) => r.revision);
    },
  };
};
export const newFsProvider = (
  path = DECO_FILE_NAME,
  appName?: string,
): DecofileProvider => {
  const fullPath = join(Deno.cwd(), path);
  return newFsProviderFromPath(fullPath, appName);
};
