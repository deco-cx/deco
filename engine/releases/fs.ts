import { join } from "std/path/mod.ts";
import { stringToHexSha256 } from "../../utils/encoding.ts";
import { exists } from "../../utils/filesystem.ts";
import { stringifyForWrite } from "../../utils/json.ts";
import { singleFlight } from "../core/utils.ts";
import { OnChangeCallback, Release } from "./provider.ts";

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

export const newFsProvider = (
  path = ".release.json",
): Release => {
  // deno-lint-ignore no-explicit-any
  const sf = singleFlight<Record<string, any>>();
  const fullPath = join(Deno.cwd(), path);
  const onChangeCbs: OnChangeCallback[] = [];
  let currentVersion = "unknown";

  const load = async () => {
    let dataText: string | null = null;
    try {
      if (!(await exists(fullPath))) {
        dataText = stringifyForWrite(sample);
        await Deno.writeTextFile(fullPath, dataText);
        return sample;
      }
      dataText = await Deno.readTextFile(fullPath);
      return JSON.parse(dataText);
    } finally {
      if (dataText) {
        stringToHexSha256(dataText).then((version) => {
          if (version !== currentVersion) {
            currentVersion = version;
            onChangeCbs.forEach((cb) => cb());
          }
        });
      }
    }
  };
  return {
    state: () => sf.do("load", load),
    archived: () => sf.do("load", load),
    onChange: (cb: OnChangeCallback) => {
      onChangeCbs.push(cb);
    },
    revision: () => Promise.resolve(currentVersion),
  };
};
