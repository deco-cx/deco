// deno-lint-ignore-file no-explicit-any
import { supabase } from "../../deps.ts";
import { Resolvable } from "../../engine/core/resolver.ts";
import { singleFlight } from "../../engine/core/utils.ts";
import getSupabaseClient from "../../supabase.ts";
import { JSONSchema, Site } from "../../types.ts";
import { randId as ulid } from "../../utils/rand.ts";
import { ENTRYPOINT } from "./constants.ts";
import { CurrResolvables, RealtimeReleaseProvider } from "./realtime.ts";
export interface PageSection {
  // Identifies the component uniquely in the project (e.g: "./sections/Header.tsx")
  key: string;
  // Pretty name for the entity
  label: string;
  // Uniquely identifies this entity in the scope of a page (that can have multiple functions, sections)
  uniqueId: string;
  props?: Record<string, unknown>;
}

export interface PageFunction extends PageSection {
  outputSchema?: JSONSchema;
}

export interface PageData {
  sections: PageSection[];
  functions: PageFunction[];
}

export type PageState = "archived" | "draft" | "published" | "dev" | "global";

export interface Page {
  id: number;
  data: PageData;
  name: string;
  path: string;
  state: PageState;
  site?: Site;
  public?: boolean;
}

export interface Match {
  // Identifies the MatchFunction uniquely in the project (e.g: "./functions/MatchRandom.ts")
  key: string;
  props?: Record<string, unknown>;
}
export interface Effect {
  // Identifies the EffectFunction uniquely in the project (e.g: "./functions/OverridePageEffect.ts")
  key: string;
  props?: Record<string, unknown>;
}

export interface FlagData {
  matches: Match[];
  effect?: Effect;
}

export type FlagState = "archived" | "draft" | "published";

export interface Flag<T = unknown> {
  id: string;
  name: string;
  state: FlagState;
  data: FlagData;
  site: number;
  key: string;
  value?: T;
  updated_at: string;
  description?: string;
}

export interface Flags {
  [key: string]: unknown;
}

interface ResolvePageSection extends Record<string, any> {
  __resolveType: string;
}
const state = "state";
const globalSections = "globalSections";
const everyoneAudience = "everyone";

const includeNamespace = (key: string, ns: string) =>
  key.replace("./", `${ns}/`);

const sectionToPageSection = (
  functionsIndexed: Record<string, PageFunction>,
  globalSections: Record<string, string>,
  ns: string,
) =>
({ key, props }: PageSection): ResolvePageSection => {
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
  if (key.endsWith("Global")) {
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
): ResolvePageSection[] => {
  const functionsIndexed: Record<string, PageFunction> = [
    ...(d.functions ?? []),
    ...((d as unknown as { loaders: PageFunction[] }).loaders ?? []),
  ].reduce((indexed, f) => {
    return { ...indexed, [`{${f.uniqueId}}`]: f };
  }, {} as Record<string, PageFunction>);

  return (d.sections ?? []).map(
    sectionToPageSection(functionsIndexed, globalSections, ns),
  );
};

const middlewareConfig = "./routes/_middleware.ts";

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
  return nsToConfig(structuredClone(baseEntrypoint), p)[p.id];
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
  if (wellKnownAccount) {
    c[name] = {
      ...globalSection.props,
      __resolveType: wellKnownAccount,
    };
  }
  c[middlewareConfig] = {
    ...middleware,
    [state]: [
      ...middleware[state],
      {
        key: name,
        value: wellKnownAccount ? { __resolveType: name } : globalSection.props,
      },
    ],
  };
  return c;
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
    c[p.id] = pageEntry;
    if (
      isGlobal(p)
    ) {
      if (isAccount(p)) {
        mapGlobalToAccount(p, namespace, c);
        return c;
      }
      c[globalSections] ??= {};
      c[globalSections][p.path] = `${p.id}`;
      return c;
    }
    const currEveryone = c[everyoneAudience];
    const everyone = p.state === "published"
      ? {
        ...currEveryone,
        routes: [
          ...currEveryone.routes,
          {
            pathTemplate: p.path,
            handler: {
              value: {
                page: {
                  __resolveType: `${p.id}`,
                },
                __resolveType: p.public
                  ? "$live/handlers/fresh.ts"
                  : "$live/handlers/devPage.ts",
              },
            },
          },
        ],
      }
      : currEveryone;
    c[everyoneAudience] = everyone;
    return c;
  };

const baseEntrypoint = Object.freeze({
  [globalSections]: {},
  [everyoneAudience]: {
    routes: [],
    __resolveType: "$live/flags/everyone.ts",
  },
  [middlewareConfig]: {
    __resolveType: "$live/loaders/state.ts",
    [state]: [],
  },
  [ENTRYPOINT]: {
    audiences: [
      {
        __resolveType: everyoneAudience,
      },
    ],
    __resolveType: "$live/handlers/routesSelection.ts",
  },
}) as Record<string, Resolvable>;

const defaultStates = ["published", "global"];
const fetchSitePages = async (
  siteId: number,
  draftPages: (string | number)[],
  includeArchived = false,
) => {
  const query = getSupabaseClient()
    .from("pages")
    .select("id, name, data, path, state, public")
    .eq("site", siteId);

  if (draftPages.length > 0) {
    query.or(
      `state.in.(${
        (includeArchived
          ? [...defaultStates, "draft", "archived"]
          : defaultStates).join(",")
      }),id.in.(${draftPages.join(",")})`,
    );
  } else {
    query.in(
      "state",
      includeArchived ? [...defaultStates, "draft", "archived"] : defaultStates,
    );
  }
  return await query;
};

const fetchSiteFlags = async (siteId: number) => {
  return await getSupabaseClient().from("flags").select("key, data, name").eq(
    "site",
    siteId,
  ).eq("state", "published");
};

const fetchSiteData = async (
  siteId: number,
  includeArchived = false,
): Promise<
  [
    Awaited<ReturnType<typeof fetchSitePages>>,
    Awaited<ReturnType<typeof fetchSiteFlags>>,
  ]
> => {
  const flags = await fetchSiteFlags(siteId);
  const flagData = flags.data ?? [];
  const pages: (string | number)[] = flagData.flatMap((flag) =>
    flag.data.effect?.props?.pageIds ?? []
  );
  return [await fetchSitePages(siteId, pages, includeArchived), flags];
};

// Supabase client setup
const subscribeForConfigChanges = (
  siteId: number,
  fetcher: () => Promise<{ data: CurrResolvables | null; error: any }>,
) =>
(
  callback: (res: CurrResolvables) => unknown,
  subscriptionCallback: (
    status: `${supabase.REALTIME_SUBSCRIBE_STATES}`,
    err?: Error,
  ) => void,
) => {
  return getSupabaseClient()
    .channel("pages")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "pages",
        filter: `site=eq.${siteId}`,
      },
      () =>
        fetcher().then((v) => {
          if (!v.error) {
            callback(
              v.data ??
                { state: {}, archived: {}, revision: ulid() },
            );
          }
        }),
    ).on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "flags",
        filter: `site=eq.${siteId}`,
      },
      () =>
        fetcher().then((v) => {
          if (!v.error) {
            callback(
              v.data ??
                { state: {}, archived: {}, revision: ulid() },
            );
          }
        }),
    )
    .subscribe(subscriptionCallback);
};

const matchesToMatchMulti = (matches: Flag["data"]["matches"], ns: string) => ({
  op: "and",
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
    const catchall = curr[ENTRYPOINT];
    const pageIds = flag.data.effect?.props?.pageIds;
    const pageId = Array.isArray(pageIds) ? pageIds[0] as number : undefined;
    if (!pageId) {
      return curr;
    }
    const page = curr[pageId];
    if (!page) {
      return curr;
    }
    curr[ENTRYPOINT] = {
      ...catchall,
      audiences: [
        ...catchall.audiences,
        {
          __resolveType: flag.key,
        },
      ],
    };
    curr[flag.key] = {
      name: flag.key,
      routes: [
        {
          pathTemplate: page.path,
          handler: {
            value: {
              page: {
                __resolveType: `${pageId}`,
              },
              __resolveType: "$live/handlers/fresh.ts",
            },
          },
        },
      ],
      matcher: matchesToMatchMulti(flag.data.matches, ns),
      __resolveType: "$live/flags/audience.ts",
    };
    return curr;
  }, entrypoint);
};

const pagesToConfig = (
  p: Page[],
  flags: Pick<Flag, "key" | "data" | "name">[],
  ns: string,
) => {
  const { [globalSections]: _, ...configs } = p.sort((pageA, pageB) =>
    pageA.state === "global" ? -1 : pageB.state === "global" ? 1 : 0
  ) // process global first
    .reduce(pageToConfig(ns), structuredClone(baseEntrypoint));
  return flagsToConfig(configs, flags, ns);
};

/**
 * Creates and return a supabaseConfigProvider based on `pages` table. The idea is that the pages will be fetched and then transformed into configurations.
 * @param siteId the site Id
 * @param namespace the site namespace.
 * @returns the created SupabaseConfigProvider
 */
export const fromPagesTable = (
  siteId: number,
  namespace: string,
): RealtimeReleaseProvider => {
  const sf = singleFlight<{ data: CurrResolvables | null; error: any }>();
  const fetcher = (includeArchived = false) =>
    sf.run(async (): Promise<
      { data: CurrResolvables | null; error: any }
    > => {
      const [{ data, error }, { data: dataFlags, error: errorFlags }] =
        await fetchSiteData(siteId, includeArchived);
      if (
        data === null || error !== null
      ) {
        return { data: data as null, error };
      }
      if (dataFlags === null || errorFlags !== null) {
        return { data: dataFlags as null, error: errorFlags };
      }
      return {
        data: {
          state: pagesToConfig(data, dataFlags, namespace),
          archived: {},
          revision: crypto.randomUUID(),
        } as CurrResolvables,
        error: null,
      };
    });
  return {
    get: fetcher,
    subscribe: subscribeForConfigChanges(siteId, fetcher),
  };
};
