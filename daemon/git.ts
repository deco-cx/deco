import { type Handler, Hono } from "@hono/hono";
import { ensureDir } from "@std/fs";
import { basename, dirname, extname, join } from "@std/path";
import {
  GitConfigScope,
  type LogResult,
  type PushResult,
  simpleGit,
  type StatusResult,
} from "simple-git";
import { createLocker } from "./async.ts";
import { logs } from "./loggings/stream.ts";

const SOURCE_PATH = Deno.env.get("SOURCE_ASSET_PATH");
const DEFAULT_TRACKING_BRANCH = Deno.env.get("DECO_TRACKING_BRANCH") ?? "main";

export const lockerGitAPI = createLocker();

const git = simpleGit(Deno.cwd(), {
  maxConcurrentProcesses: 1,
  trimmed: true,
  progress: ({ method, stage, progress }) =>
    logs.push({
      level: "info",
      message: `git.${method} ${stage} stage ${progress}% complete`,
      timestamp: Date.now(),
    }),
});

const getMergeBase = async () => {
  const status = await git.status();
  const current = status.current;
  const tracking = status.tracking || DEFAULT_TRACKING_BRANCH;

  if (!current || !tracking) {
    throw new Error(`Missing local or upstream branches`);
  }

  const base = await git.raw("merge-base", current, tracking);

  return base;
};

export interface GitDiffAPI {
  response: {
    from?: string;
    to?: string;
    mode: "text" | "binary";
  };
  searchParams: {
    path: string;
  };
}

const WELL_KNOWN_TEXT_FILE_TYPES = new Set<string>([
  ".txt",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  ".html",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".md",
  ".yml",
  ".yaml",
  ".toml",
  ".xml",
  ".env",
]);

const isTextFile = (path: string) => {
  const ext = extname(path);
  return WELL_KNOWN_TEXT_FILE_TYPES.has(ext) ||
    // for the .env case
    WELL_KNOWN_TEXT_FILE_TYPES.has(path);
};

export const diff: Handler = async (c) => {
  const url = new URL(c.req.url);
  const rawPath = url.searchParams.get("path");
  const path = rawPath?.startsWith("/") ? rawPath.slice(1) : rawPath;

  if (!path) {
    return new Response("Missing path search param", { status: 400 });
  }

  if (!isTextFile(path)) {
    return new Response(JSON.stringify({ mode: "binary" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  const base = await getMergeBase();
  const [from, to] = await Promise.all([
    git.show(`${base}:${path}`).catch(() => undefined),
    Deno.readTextFile(path).catch(() => undefined),
  ]);

  return new Response(JSON.stringify({ from, to, mode: "text" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};

export interface GitStatusAPI {
  response: StatusResult;
  searchParams: {
    fetch?: boolean;
  };
}

/** Git status */
export const status: Handler = async (c) => {
  const url = new URL(c.req.url);
  const fetch = url.searchParams.get("fetch") === "true";

  const base = await getMergeBase();

  if (fetch) {
    await git.fetch(["-p"]);
  }

  const status = await git
    .reset(["."])
    .reset([base])
    .status();

  return new Response(JSON.stringify(status), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};

export interface PublishAPI {
  body: {
    message: string;
    author: {
      name?: string;
      email?: string;
      timestamp?: number;
      timezoneOffset?: number;
    };
  };
  response: PushResult;
}

const persist = async (oid: string) => {
  if (!SOURCE_PATH) {
    return;
  }

  const start = performance.now();

  const outfilePath = join(SOURCE_PATH, "..", "..", oid, basename(SOURCE_PATH));
  await ensureDir(dirname(outfilePath));

  const tar = new Deno.Command("tar", {
    cwd: Deno.cwd(),
    args: [
      "-cf",
      outfilePath,
      "--exclude=.git",
      ".",
    ],
  });

  const status = await tar.spawn().status;

  console.log(
    `[tar]: Tarballing took ${(performance.now() - start).toFixed(0)}ms`,
  );

  if (!status.success) {
    throw new Error("Failed to tarball");
  }
};

// TODO: maybe tag with versions!
export const publish = ({ build }: Options): Handler => {
  const buildMap = new Map<string, Promise<void>>();

  const doBuild = (oid: string) => {
    const p = buildMap.get(oid) || (async () => {
      try {
        await build?.spawn()?.status;
        await persist(oid);
      } catch (e) {
        console.error("Building failed with:", e);
      } finally {
        buildMap.delete(oid);
      }
    })();

    buildMap.set(oid, p);

    return p;
  };

  return async (c) => {
    const body = await c.req.json() as PublishAPI["body"];
    const author = body.author || { name: "decobot", email: "capy@deco.cx" };
    const message = body.message || `New release by ${author.name}`;

    await git.fetch(["-p"]);

    const base = await getMergeBase();

    const commit = await git
      .reset(["."])
      .reset([base])
      .add(["."])
      .commit(message, {
        "--author": `${author.name} <${author.email}>`,
        "--no-verify": null,
      });

    // Runs build pipeline asynchronously
    doBuild(commit.commit);

    const result = await git.push();

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
};

export interface CheckoutAPI {
  body: {
    filepaths: string[];
  };
}

export const discard: Handler = async (c) => {
  const { filepaths } = await c.req.json() as CheckoutAPI["body"];

  await git.fetch(["-p"]);

  const base = await getMergeBase();

  await git.reset(["."])
    .reset([base])
    .checkout(
      filepaths.map((path) => path.startsWith("/") ? path.slice(1) : path),
    );

  return new Response(null, { status: 204 });
};

export interface RebaseAPI {
  response: void;
}

export const rebase: Handler = async () => {
  await git
    .fetch(["-p"])
    .add(".")
    .commit("Before rebase", { "--no-verify": null })
    .pull({ "--rebase": null, "--strategy-option": "theirs" });

  const base = await getMergeBase();

  await git.reset([base]);

  return new Response(null, { status: 204 });
};

export interface GitLogAPI {
  response: LogResult;
  searchParams: {
    limit?: number;
  };
}

export const log: Handler = async (c) => {
  const url = new URL(c.req.url);
  const limit = Number(url.searchParams.get("limit")) || 10;

  const log = await git.log();

  return new Response(
    JSON.stringify({ ...log, all: log.all.slice(0, limit) }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    },
  );
};

export const ensureGit = async (
  { site }: Pick<Options, "site">,
) => {
  const assertGitBinary = async () => {
    const cmd = new Deno.Command("git", {
      args: ["--version"],
      stdout: "piped",
    });

    const status = await cmd.spawn().status;

    if (!status.success) {
      throw new Error("Git binary not found");
    }
  };

  const assertGitFolder = async () => {
    const hasGitFolder = await Deno.stat(join(Deno.cwd(), ".git"))
      .then(() => true)
      .catch((e) => e instanceof Deno.errors.NotFound ? false : true);

    await git
      .addConfig("safe.directory", Deno.cwd(), true, GitConfigScope.global)
      .addConfig("push.autoSetupRemote", "true", false, GitConfigScope.global);

    const [name, email] = await Promise.all([
      git.getConfig("user.name", GitConfigScope.global),
      git.getConfig("user.email", GitConfigScope.global),
    ]);

    if (!name.value && name.values.length === 0) {
      await git.addConfig("user.name", "decobot", false, GitConfigScope.global);
    }

    if (!email.value && email.values.length === 0) {
      await git.addConfig(
        "user.email",
        "capy@deco.cx",
        false,
        GitConfigScope.global,
      );
    }

    if (hasGitFolder) {
      return console.log("Git folder already exists, skipping init");
    }

    await git.clone(`git@github.com:deco-sites/${site}.git`, ".", [
      "--depth",
      "1",
      "--single-branch",
      "--branch",
      DEFAULT_TRACKING_BRANCH,
    ]);
  };

  await Promise.all([assertGitBinary(), assertGitFolder()]);
};

interface Options {
  build: Deno.Command | null;
  site: string;
}

export const createGitAPIS = (options: Options) => {
  const app = new Hono();

  app.use(lockerGitAPI.wlock);
  app.get("/diff", diff);
  app.get("/status", status);
  app.get("/log", log);
  app.post("/publish", publish(options));
  app.post("/discard", discard);
  app.post("/rebase", rebase);

  return app;
};
