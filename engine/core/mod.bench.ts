import denoJSON from "../../deno.json" with { type: "json" };
import { genHints } from "../../engine/core/hints.ts";
import { type BaseContext, resolve } from "../../engine/core/resolver.ts";
import releaseJSON from "./hints.test.json" with { type: "json" };
const danglingRecover = (parent: unknown) => parent;

const resolveHints = {}; //on-demand hints
Deno.bench(
  "resolve current version (with on-demand hints)",
  { group: "resolve", baseline: true },
  async () => {
    const context: BaseContext = {
      revision: "",
      resolveChain: [],
      resolveId: "1",
      resolverId: "unknown",
      resolvables: releaseJSON,
      resolvers: {},
      memo: {},
      resolveHints,
      danglingRecover,
      runOnce: (_key, f) => f(),
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
      revision: "",
      resolveChain: [],
      resolveId: "1",
      resolverId: "unknown",
      memo: {},
      resolvables: releaseJSON,
      resolvers: {},
      resolveHints: generatedHints,
      danglingRecover,
      runOnce: (_, f) => f(),
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
  `https://cdn.jsdelivr.net/gh/deco-cx/deco@${denoJSON.version}/engine/core/resolver.ts`
);
Deno.bench(
  `resolve ${denoJSON.version} version (with on-demand hints)`,
  { group: "resolve" },
  async () => {
    const context = {
      resolveChain: [],
      resolveId: "1",
      resolvables: releaseJSON,
      resolvers: {},
      memo: {},
      resolveHints,
      danglingRecover,
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
