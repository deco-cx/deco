import { debounce } from "@std/async/debounce";
import { equal } from "@std/assert/equal";
import { join } from "@std/path";
import { exists } from "../../utils/filesystem.ts";
import { stringifyForWrite } from "../../utils/json.ts";
import { getDecofileJSONFromDecofile } from "./json.ts";
import type {
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

export const DECO_FILE_NAME = ".decofile.json";

export const newFsProviderFromPath = (
  fullPath: string,
  appName?: string,
): DecofileProvider => {
  const onChangeCbs: OnChangeCallback[] = [];
  let previousState: unknown = null;

  const doUpdateState = async () => {
    const state = await Deno.readTextFile(fullPath)
      .then(JSON.parse)
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
      const state = await Deno.readTextFile(fullPath).then(JSON.parse);
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
      return Deno.readTextFile(fullPath).then(JSON.parse);
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
