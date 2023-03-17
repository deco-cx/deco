// deno-lint-ignore-file no-explicit-any
import { Resolvable } from "$live/engine/core/resolver.ts";
import {
  Page,
  PageData,
  PageFunction as Function,
  PageSection as Section,
} from "$live/types.ts";
import { ConfigProvider } from "$live/engine/fresh/provider.ts";
import getSupabaseClient from "$live/supabase.ts";
import { supabase } from "$live/deps.ts";

interface PageSection extends Record<string, any> {
  __resolveType: string;
}
const globalsKey = "globals";

const sectionToPageSection =
  (functionsIndexed: Record<string, Function>, ns: string) =>
  ({ key, props }: Section): PageSection => {
    const newProps: Record<string, any> = {};
    for (const [key, value] of Object.entries(props ?? {})) {
      if (functionsIndexed[value as string]) {
        const func = functionsIndexed[value as string];
        newProps[key] = {
          ...func.props,
          __resolveType: func.key
            .replace("./", `${ns}/`),
        };
      } else {
        newProps[key] = value;
      }
    }
    return {
      ...newProps,
      __resolveType: key
        .replace("./", `${ns}/`),
    };
  };
const dataToSections = (d: PageData, ns: string): PageSection[] => {
  const functionsIndexed: Record<string, Function> = [
    ...(d.functions ?? []),
    ...((d as unknown as { loaders: Function[] }).loaders ?? []),
  ].reduce((indexed, f) => {
    return { ...indexed, [`{${f.uniqueId}}`]: f };
  }, {} as Record<string, Function>);

  return d.sections.map(sectionToPageSection(functionsIndexed, ns));
};

const catchAllConfig = "./routes/[...catchall].tsx";

interface AudienceFlag {
  name: string;
  matcher: {
    __resolveType: "$live/matchers/MatchAlways.ts";
  };
  routes: {
    [key: string]: {
      page: {
        __resolveType: string;
      };
      __resolveType: "$live/handlers/fresh.ts";
    };
  };
  __resolveType: string;
}

interface CatchAllConfigs {
  handler: {
    flags: AudienceFlag[];
    __resolveType: "$live/handlers/routesSelection.ts";
  };
  __resolveType: "resolve";
}

const isGlobalConfig = (p: Page): boolean => {
  return (
    p.data?.sections.length === 1 &&
    (p.data.sections[0].key.includes("global.tsx"))
  );
};
const pageToConfig =
  (namespace: string) =>
  (c: Record<string, Resolvable>, p: Page): Record<string, Resolvable> => {
    if (p.state === "global" && p.data?.sections.length === 1) {
      const fstSection = p.data.sections[0];
      if (fstSection.key.includes("global.tsx")) {
        const globalSection = p.data.sections[0];
        const byDashSplit = globalSection.key.split("/");
        const [name] = byDashSplit[byDashSplit.length - 1].split(".");
        return {
          ...c,
          [globalsKey]: {
            ...(c[globalsKey] ?? {}),
            [name]: globalSection.props,
          },
        };
      }
      if (p.path.includes("Global")) {
        return {
          ...c,
          [p.path]: {
            ...(dataToSections(p.data, namespace)[0]),
          },
        };
      }
    }
    const pageEntry = {
      sections: dataToSections(p.data, namespace),
      __resolveType: "$live/pages/LivePage.tsx",
    };
    const catchall = c[catchAllConfig] as CatchAllConfigs;
    const everyone = p.state === "published"
      ? {
        ...catchall.handler.flags[0],
        routes: {
          ...catchall.handler.flags[0].routes,
          [p.path]: {
            page: {
              __resolveType: `${p.id}`,
            },
            __resolveType: "$live/handlers/fresh.ts",
          },
        },
      }
      : catchall.handler.flags[0];
    return {
      ...c,
      [p.id]: pageEntry,
      [catchAllConfig]: {
        ...catchall,
        handler: {
          ...catchall.handler,
          flags: [everyone],
        },
      },
    };
  };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
const sleepBetweenRetriesMS = 100;
const refetchIntervalMS = 2_000;
const baseEntrypoint = {
  [catchAllConfig]: {
    __resolveType: "resolve",
    handler: {
      flags: [
        {
          routes: {},
          __resolveType: "$live/flags/everyone.ts",
        },
      ],
      __resolveType: "$live/handlers/routesSelection.ts",
    },
  },
} as Record<string, Resolvable>;
export const newSupabaseProviderLegacy = (
  siteId: number,
  namespace: string,
): ConfigProvider => {
  let remainingRetries = 5;
  let lastError: supabase.PostgrestSingleResponse<unknown>["error"] = null;
  const fetchSitePages = async () => {
    return await getSupabaseClient()
      .from("pages")
      .select("id, name, data, path, state")
      .eq("site", siteId);
  };

  const tryResolveFirstLoad = async (
    resolve: (
      value:
        | Record<string, Resolvable<any>>
        | PromiseLike<Record<string, Resolvable<any>>>,
    ) => void,
    reject: (reason: unknown) => void,
  ) => {
    if (remainingRetries === 0) {
      reject(lastError); // TODO @author Marcos V. Candeia should we panic? and exit? Deno.exit(1)
      return;
    }
    const { data, error } = await fetchSitePages();
    if (error != null || data === null) {
      remainingRetries--;
      lastError = error;
      await sleep(sleepBetweenRetriesMS);
      await tryResolveFirstLoad(resolve, reject);
      return;
    }
    resolve(data.reduce(pageToConfig(namespace), baseEntrypoint));
  };

  let currResolvables: Promise<Record<string, Resolvable<any>>> = new Promise<
    Record<string, Resolvable<any>>
  >(tryResolveFirstLoad);

  let currCb: null | (() => void) = null;

  currResolvables.then(() => {
    let singleFlight = false;
    setInterval(async () => {
      if (!currCb || singleFlight) {
        return;
      }
      singleFlight = true;
      const { data, error } = await fetchSitePages();
      if (data === null || error !== null) {
        singleFlight = false;
        return;
      }
      currResolvables = Promise.resolve(
        data.reduce(pageToConfig(namespace), baseEntrypoint),
      );
      currCb();
      singleFlight = false;
    }, refetchIntervalMS);
  });

  return {
    get: () => currResolvables,
    onChange: (cb) => {
      currCb = cb;
    },
  };
};
