import { BaseContext, resolve } from "$live/engine/core/resolver.ts";
import meta from "$live/meta.json" assert { type: "json" };
import releaseJSON from "./hints.test.json" assert { type: "json" };
Deno.bench(
  "resolve current version",
  { group: "resolve", baseline: true },
  async () => {
    const context: BaseContext = {
      resolveChain: [],
      resolveId: "1",
      resolvables: releaseJSON,
      resolvers: {},
      resolveHints: {},
      resolve: <T>(data: unknown) => {
        return data as T;
      },
    };

    const waitAll: Promise<unknown>[] = [];
    Object.keys(releaseJSON).map((key) => {
      waitAll.push(resolve(
        key,
        {
          ...context,
          danglingRecover: (parent, _ctx) => parent,
        },
      ));
    });
    await Promise.all(waitAll);
  },
);

const latestVersion = await import(
  `https://denopkg.com/deco-cx/live@${meta.version}/engine/core/resolver.ts`
);
Deno.bench(
  `resolve ${meta.version} version`,
  { group: "resolve" },
  async () => {
    const context = {
      resolveChain: [],
      resolveId: "1",
      resolvables: releaseJSON,
      resolvers: {},
      resolve: <T>(data: unknown) => {
        return data as T;
      },
    };

    const waitAll: Promise<unknown>[] = [];
    Object.keys(releaseJSON).map((key) => {
      waitAll.push(latestVersion.resolve(
        { __resolveType: key },
        {
          ...context,
          danglingRecover: (parent: unknown) => parent,
        },
      ));
    });
    await Promise.all(waitAll);
  },
);
