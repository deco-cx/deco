import { debounce } from "std/async/debounce.ts";
import { join } from "std/path/mod.ts";
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
    .then((response) => response.json<Record<string, unknown>>()).catch((
      _e,
    ) => ({} as Record<string, unknown>));
};

export const DECO_FILE_NAME = ".decofile.json";

export const newFsProviderFromPath = (
  fullPath: string,
  appName?: string,
): DecofileProvider => {
  const onChangeCbs: OnChangeCallback[] = [];
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
          return { state: data, revision: `${Date.now()}` };
        });
      }
      return {
        state: await Deno.readTextFile(fullPath).then(JSON.parse),
        revision: `${Date.now()}`,
      };
    },
  ).then((result) => {
    (async () => {
      const watcher = Deno.watchFs(fullPath);
      const updateState = debounce(async () => {
        const state = await Deno.readTextFile(fullPath)
          .then(JSON.parse)
          .catch((_e) => null);
        if (state === null) {
          return;
        }
        decofile = Promise.resolve({
          state,
          revision: `${Date.now()}`,
        });
        for (const cb of onChangeCbs) {
          cb();
        }
      }, 300);
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
    set: (state, rev) => {
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
