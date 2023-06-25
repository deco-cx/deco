import { join } from "std/path/mod.ts";
import { stringToHexSha256 } from "../../utils/encoding.ts";
import { exists } from "../../utils/filesystem.ts";
import { singleFlight } from "../core/utils.ts";
import { ENTRYPOINT } from "./constants.ts";
import { OnChangeCallback, Release } from "./provider.ts";

const sample = {
  "audience-everyone": {
    overrides: [],
    routes: [{
      pathTemplate: "/*",
      handler: {
        url: "https://www.google.com",
        __resolveType: "$live/handlers/proxy.ts",
      },
    }],
    __resolveType: "$live/flags/everyone.ts",
  },
  [ENTRYPOINT]: {
    audiences: [
      {
        __resolveType: "audience-everyone",
      },
    ],
    __resolveType: "$live/handlers/routesSelection.ts",
  },
};

export const newFsProvider = (
  path = ".release.json",
): Release => {
  // deno-lint-ignore no-explicit-any
  const sf = singleFlight<Record<string, any>>();
  const fullPath = join(Deno.cwd(), path);
  const onChangeCbs: OnChangeCallback[] = [];

  const load = async () => {
    try {
      if (!(await exists(fullPath))) {
        await Deno.writeTextFile(fullPath, JSON.stringify(sample, null, 2));
        return sample;
      }
      return JSON.parse(await Deno.readTextFile(fullPath));
    } finally {
      onChangeCbs.forEach((cb) => cb());
    }
  };
  return {
    state: () => sf.do("load", load),
    archived: () => sf.do("load", load),
    onChange: (cb: OnChangeCallback) => {
      onChangeCbs.push(cb);
    },
    revision: () =>
      sf.do("load", load).then(async (resp) => {
        return await stringToHexSha256(JSON.stringify(resp));
      }),
  };
};
