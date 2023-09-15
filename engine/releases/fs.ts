import { join } from "std/path/mod.ts";
import { exists } from "../../utils/filesystem.ts";
import { stringifyForWrite } from "../../utils/json.ts";
import { OnChangeCallback, Release } from "./provider.ts";
import { CurrResolvables } from "./supabaseProvider.ts";

const sample = {
  "decohub": {
    __resolveType: "deco-sites/storefront/apps/decohub.ts",
  },
  "admin-app": {
    resolvables: {
      __resolveType: "deco-sites/admin/loaders/state.ts",
    },
    __resolveType: "decohub/apps/admin.ts",
  },
};

const copyFrom = (appName: string): Promise<Record<string, unknown>> => {
  return fetch(`https://${appName.replace("/", "-")}.deno.dev/live/release`)
    .then((response) => response.json()).catch((_e) => ({}));
};

export const newFsProvider = (
  path = ".release.json",
  appName?: string,
): Release => {
  const fullPath = join(Deno.cwd(), path);
  const onChangeCbs: OnChangeCallback[] = [];
  const copyDecoState = !appName ? Promise.resolve({}) : copyFrom(appName);
  let currResolvables: Promise<CurrResolvables> = exists(fullPath).then(
    async (exists) => {
      if (!exists) {
        const data = { ...sample, ...await copyDecoState };
        return Deno.writeTextFile(
          fullPath,
          stringifyForWrite(data),
        ).then(() => {
          return { state: data, archived: {}, revision: `${Date.now()}` };
        });
      }
      return {
        state: await Deno.readTextFile(fullPath).then((result) =>
          JSON.parse(result)
        ),
        archived: {},
        revision: `${Date.now()}`,
      };
    },
  ).then((result) => {
    (async () => {
      const watcher = Deno.watchFs(fullPath);
      for await (const _event of watcher) {
        const state = await Deno.readTextFile(fullPath).then((result) =>
          JSON.parse(result)
        ).catch((_e) => null);
        if (state === null) {
          continue;
        }
        currResolvables = Promise.resolve({
          state,
          archived: {},
          revision: `${Date.now()}`,
        });
        for (const cb of onChangeCbs) {
          cb();
        }
      }
    })();

    return result;
  });

  return {
    state: () => currResolvables.then((r) => r.state),
    archived: () => currResolvables.then((r) => r.archived),
    onChange: (cb: OnChangeCallback) => {
      onChangeCbs.push(cb);
    },
    revision: () => currResolvables.then((r) => r.revision),
  };
};
