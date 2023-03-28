// deno-lint-ignore-file no-explicit-any
import { supabase } from "$live/deps.ts";
import { ConfigStore } from "$live/engine/configstore/provider.ts";
import { Resolvable } from "$live/engine/core/resolver.ts";
import { singleFlight } from "$live/engine/core/utils.ts";
import getSupabaseClient from "$live/supabase.ts";
import {
  Flag,
  Page,
  PageData,
  PageFunction as Function,
  PageSection as Section,
} from "$live/types.ts";

interface PageSection extends Record<string, any> {
  __resolveType: string;
}
const state = "state";
const globalSections = "globalSections";
const everyoneAudience = "everyone";

const includeNamespace = (key: string, ns: string) =>
  key.replace("./", `${ns}/`);

const sectionToPageSection = (
  functionsIndexed: Record<string, Function>,
  globalSections: Record<string, string>,
  ns: string,
) =>
({ key, props }: Section): PageSection => {
  const newProps: Record<string, any> = {};
  for (const [key, value] of Object.entries(props ?? {})) {
    if (functionsIndexed[value as string]) {
      const func = functionsIndexed[value as string];
      newProps[key] = {
        ...func.props,
        __resolveType: includeNamespace(func.key, ns),
      };
    } else {
      newProps[key] = value;
    }
  }
  if (key.includes("Global")) {
    return {
      page: {
        __resolveType: globalSections[key],
      },
      __resolveType: "$live/sections/PageInclude.tsx",
    };
  }
  return {
    ...newProps,
    __resolveType: includeNamespace(key, ns),
  };
};
const dataToSections = (
  d: PageData,
  globalSections: Record<string, string>,
  ns: string,
): PageSection[] => {
  const functionsIndexed: Record<string, Function> = [
    ...(d.functions ?? []),
    ...((d as unknown as { loaders: Function[] }).loaders ?? []),
  ].reduce((indexed, f) => {
    return { ...indexed, [`{${f.uniqueId}}`]: f };
  }, {} as Record<string, Function>);

  return d.sections.map(
    sectionToPageSection(functionsIndexed, globalSections, ns),
  );
};

const catchAllConfig = "./routes/[...catchall].tsx";
const middlewareConfig = "./routes/_middleware.ts";

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

const sectionToAccount: Record<string, string> = {
  "deco-sites/std/sections/configVTEX.global.tsx":
    "deco-sites/std/accounts/vtex.ts",
  "deco-sites/std/sections/configOCC.global.tsx":
    "deco-sites/std/accounts/occ.ts",
  "deco-sites/std/sections/configShopify.global.tsx":
    "deco-sites/std/accounts/shopify.ts",
  "deco-sites/std/sections/configVNDA.global.tsx":
    "deco-sites/std/accounts/vnda.ts",
  "deco-sites/std/sections/configYourViews.global.tsx":
    "deco-sites/std/accounts/yourViews.ts",
};

export const mapPage = (namespace: string, p: Page): Resolvable => {
  const nsToConfig = pageToConfig(namespace);
  return nsToConfig(baseEntrypoint, p)[p.id];
};

function mapGlobalToAccount(
  p: Page,
  namespace: string,
  c: Record<string, any>,
) {
  const globalSection = p.data.sections[0];
  const accountId = includeNamespace(globalSection.key, namespace);
  const byDashSplit = accountId.split("/");
  const [name] = byDashSplit[byDashSplit.length - 1].split(".");
  const wellKnownAccount = sectionToAccount[accountId];
  const middleware = c[middlewareConfig];
  return {
    ...c,
    [middlewareConfig]: {
      ...middleware,
      [state]: {
        ...middleware[state],
        [name]: wellKnownAccount
          ? { __resolveType: accountId }
          : globalSection.props,
      },
    },
    ...wellKnownAccount
      ? {
        [accountId]: {
          ...globalSection.props,
          __resolveType: wellKnownAccount,
        },
      }
      : {},
  };
}

const isAccount = (page: Page): boolean =>
  page.data.sections[0].key.endsWith("global.tsx");
const isGlobal = (page: Page): boolean =>
  page.state === "global" && page.data?.sections.length === 1;
const pageToConfig =
  (namespace: string) =>
  (c: Record<string, Resolvable>, p: Page): Record<string, Resolvable> => {
    const pageEntry = {
      name: p.name,
      path: p.path, // only for compatibilty with flags.
      sections: dataToSections(p.data, c[globalSections], namespace),
      __resolveType: "$live/pages/LivePage.tsx",
    };
    if (
      isGlobal(p)
    ) {
      if (isAccount(p)) {
        return { ...mapGlobalToAccount(p, namespace, c), [p.id]: pageEntry };
      }
      return {
        ...c,
        [p.id]: pageEntry,
        [globalSections]: { ...c[globalSections], [p.path]: `${p.id}` },
      };
    }
    const currEveryone = c[everyoneAudience];
    const everyone = p.state === "published"
      ? {
        ...currEveryone,
        routes: {
          ...currEveryone.routes,
          [p.path]: {
            page: {
              __resolveType: `${p.id}`,
            },
            __resolveType: p.public
              ? "$live/handlers/fresh.ts"
              : "$live/handlers/devPage.ts",
          },
        },
      }
      : currEveryone;
    return {
      ...c,
      [p.id]: pageEntry,
      [everyoneAudience]: everyone,
    };
  };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
const sleepBetweenRetriesMS = 100;
const refetchIntervalMS = 2_000;
const baseEntrypoint = {
  [globalSections]: {},
  [everyoneAudience]: {
    routes: {},
    __resolveType: "$live/flags/everyone.ts",
  },
  [middlewareConfig]: {
    __resolveType: "resolve",
    [state]: {
      __resolveType: "resolve",
    },
  },
  [catchAllConfig]: {
    __resolveType: "resolve",
    handler: {
      flags: [
        {
          __resolveType: everyoneAudience,
        },
      ],
      __resolveType: "$live/handlers/routesSelection.ts",
    },
  },
} as Record<string, Resolvable>;

const fetchSitePages = async (siteId: number) => {
  return await getSupabaseClient()
    .from("pages")
    .select("id, name, data, path, state, public")
    .eq("site", siteId)
    .neq("state", "archived");
};

const fetchArchivedPages = async (siteId: number) => {
  return await getSupabaseClient()
    .from("pages")
    .select("id, name, data, path, state, public")
    .eq("site", siteId)
    .eq("state", "archived");
};

const fetchSiteFlags = async (siteId: number) => {
  return await getSupabaseClient().from("flags").select("key, data, name").eq(
    "site",
    siteId,
  ).eq("state", "published");
};

const fetchSiteData = (siteId: number) =>
  Promise.all([fetchSitePages(siteId), fetchSiteFlags(siteId)]);

export const newSupabaseProviderLegacyDeploy = (
  siteId: number,
  namespace: string,
): ConfigStore => {
  let remainingRetries = 5;
  let lastError: supabase.PostgrestSingleResponse<unknown>["error"] = null;

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
    const [{ data, error }, { data: dataFlags, error: errorFlags }] =
      await fetchSiteData(siteId);
    if (
      error != null || data === null || dataFlags === null ||
      errorFlags !== null
    ) {
      remainingRetries--;
      lastError = error;
      await sleep(sleepBetweenRetriesMS);
      await tryResolveFirstLoad(resolve, reject);
      return;
    }
    resolve(pagesToConfig(data, dataFlags, namespace));
  };

  let currResolvables: Promise<Record<string, Resolvable<any>>> = new Promise<
    Record<string, Resolvable<any>>
  >(tryResolveFirstLoad);

  currResolvables.then(() => {
    let singleFlight = false;
    setInterval(async () => {
      if (singleFlight) {
        return;
      }
      singleFlight = true;
      const [{ data, error }, { data: dataFlags, error: errorFlags }] =
        await fetchSiteData(siteId);
      if (
        data === null || error !== null || dataFlags === null ||
        errorFlags !== null
      ) {
        singleFlight = false;
        return;
      }
      currResolvables = Promise.resolve(
        pagesToConfig(data, dataFlags, namespace),
      );
      singleFlight = false;
    }, refetchIntervalMS);
  });

  const local = newSupabaseProviderLegacyLocal(siteId, namespace);
  return {
    archived: local.archived.bind(local),
    state: () => currResolvables,
  };
};

const matchesToMatchMulti = (matches: Flag["data"]["matches"], ns: string) => ({
  op: "or",
  matchers: matches.map((m) => ({
    ...m.props,
    __resolveType: includeNamespace(m.key, ns).replace("functions", "matchers"),
  })),
  __resolveType: "$live/matchers/MatchMulti.ts",
});

const flagsToConfig = (
  entrypoint: typeof baseEntrypoint,
  flags: Pick<Flag, "key" | "data" | "name">[],
  ns: string,
) => {
  return flags.reduce((curr, flag) => {
    const catchall = curr[catchAllConfig];
    const pageIds = flag.data.effect?.props?.pageIds;
    const pageId = Array.isArray(pageIds) ? pageIds[0] as number : undefined;
    if (!pageId) {
      return curr;
    }
    const page = curr[pageId];
    if (!page) {
      return curr;
    }
    return {
      ...curr,
      [catchAllConfig]: {
        ...catchall,
        handler: {
          ...catchall.handler,
          flags: [
            ...catchall.handler.flags,
            {
              __resolveType: flag.key,
            },
          ],
        },
      },
      [flag.key]: {
        name: flag.key,
        routes: {
          [page.path]: {
            page: {
              __resolveType: `${pageId}`,
            },
            __resolveType: "$live/handlers/fresh.ts",
          },
        },
        matcher: matchesToMatchMulti(flag.data.matches, ns),
        __resolveType: "$live/flags/audience.ts",
      },
    };
  }, entrypoint);
};
const pagesToConfig = (
  p: Page[],
  flags: Pick<Flag, "key" | "data" | "name">[],
  ns: string,
) => {
  const configs = p.sort((pageA, pageB) =>
    pageA.state === "global" ? -1 : pageB.state === "global" ? 1 : 0
  ) // process global first
    .reduce(pageToConfig(ns), baseEntrypoint);
  return flagsToConfig(configs, flags, ns);
};

export const newSupabaseProviderLegacyLocal = (
  siteId: number,
  namespace: string,
) => {
  const sf = singleFlight<Record<string, Resolvable>>();
  return {
    archived: async () => { // archived pages cannot be added on flags.
      return await sf.do("archived", async () => {
        const { data, error } = await fetchArchivedPages(siteId);
        if (
          data === null || error !== null
        ) {
          throw error;
        }
        return pagesToConfig(data, [], namespace);
      });
    },
    state: async () => {
      return await sf.do("state", async () => {
        const [{ data, error }, { data: dataFlags, error: errorFlags }] =
          await fetchSiteData(siteId);
        if (
          data === null || error !== null || dataFlags === null ||
          errorFlags !== null
        ) {
          throw (error ?? errorFlags);
        }
        return pagesToConfig(data, dataFlags, namespace);
      });
    },
  };
};
