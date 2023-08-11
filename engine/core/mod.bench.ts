import { genHints } from "$live/engine/core/hints.ts";
import { BaseContext, resolve } from "$live/engine/core/resolver.ts";
import meta from "$live/meta.json" assert { type: "json" };
import releaseJSON from "./hints.test.json" assert { type: "json" };
const danglingRecover = (parent: unknown) => parent;

const resolveHints = {}; //on-demand hints
Deno.bench(
  "resolve current version (with on-demand hints)",
  { group: "resolve", baseline: true },
  async () => {
    const context: BaseContext = {
      resolveChain: [],
      resolveId: "1",
      resolvables: releaseJSON,
      resolvers: {},
      resolveHints,
      danglingRecover,
      extend: () => {},
      resolve: <T>(data: unknown) => {
        return data as T;
      },
    };

    const waitAll: Promise<unknown>[] = [];
    Object.keys(releaseJSON).map((key) => {
      waitAll.push(resolve(
        key,
        context,
      ));
    });
    await Promise.all(waitAll);
  },
);

const generatedHints = genHints(releaseJSON);
Deno.bench(
  "resolve current version (with pregenerated hints)",
  { group: "resolve" },
  async () => {
    const context: BaseContext = {
      resolveChain: [],
      resolveId: "1",
      resolvables: releaseJSON,
      resolvers: {},
      resolveHints: generatedHints,
      danglingRecover,
      extend: () => {},
      resolve: <T>(data: unknown) => {
        return data as T;
      },
    };

    const waitAll: Promise<unknown>[] = [];
    Object.keys(releaseJSON).map((key) => {
      waitAll.push(resolve(
        key,
        context,
      ));
    });
    await Promise.all(waitAll);
  },
);

const latestVersion = await import(
  `https://denopkg.com/deco-cx/live@${meta.version}/engine/core/resolver.ts`
);
Deno.bench(
  `resolve ${meta.version} version (with on-demand hints)`,
  { group: "resolve" },
  async () => {
    const context = {
      resolveChain: [],
      resolveId: "1",
      resolvables: releaseJSON,
      resolvers: {},
      resolveHints,
      danglingRecover,
      extend: () => {},
      resolve: <T>(data: unknown) => {
        return data as T;
      },
    };

    const waitAll: Promise<unknown>[] = [];
    Object.keys(releaseJSON).map((key) => {
      waitAll.push(latestVersion.resolve(
        { __resolveType: key },
        context,
      ));
    });
    await Promise.all(waitAll);
  },
);
