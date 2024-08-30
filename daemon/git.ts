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
import { DENO_DEPLOYMENT_ID, VERBOSE } from "./main.ts";

const SOURCE_PATH = Deno.env.get("SOURCE_ASSET_PATH");
const DEFAULT_TRACKING_BRANCH = Deno.env.get("DECO_TRACKING_BRANCH") ?? "main";
const REPO_URL = Deno.env.get("DECO_REPO_URL");

export const lockerGitAPI = createLocker();

export const git = simpleGit(Deno.cwd(), {
  config: ["core.editor=true"], // disable interactive editor
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
  const defaultTrackingBranch = typeof DENO_DEPLOYMENT_ID === "string"
    ? DEFAULT_TRACKING_BRANCH
    : undefined;
  let tracking: string | undefined | null = status.tracking ||
    defaultTrackingBranch;

  if (VERBOSE) {
    console.log("current branch is: ", { current });
  }
  if (!current) {
    throw new Error(`Missing local or upstream branches`);
  }

  if (!tracking) {
    tracking = prompt(
      "missing git tracking branch, please enter the name of your gitbranch:",
    );
    if (tracking) {
      await git.raw("push", "--set-upstream", "origin", tracking);
    }
  }

  if (!tracking || !current) {
    throw new Error(
      "missing tracking branch, please run `git push --set-upstream origin $BRANCH_NAME`",
    );
  }

  return git.raw("merge-base", current, tracking);
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

const resetToMergeBase = async () => {
  const base = await getMergeBase();
  await git.reset(["."]).reset([base]);
};

/** Git status */
export const status: Handler = async (c) => {
  const url = new URL(c.req.url);
  const fetch = url.searchParams.get("fetch") === "true";

  if (fetch) {
    await git.fetch(["-p"]);
  }

  await resetToMergeBase();

  return new Response(JSON.stringify(await git.status()), {
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
// TODO: handle rebase conflicts
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

    await resetToMergeBase();

    const commit = await git
      .add(["."])
      .commit(message, {
        "--author": `${author.name} <${author.email}>`,
        "--no-verify": null,
      });

    const result = await git.push();

    // Runs build pipeline asynchronously
    doBuild(commit.commit);

    return Response.json(result);
  };
};

export interface CheckoutAPI {
  body: {
    filepaths: string[];
  };
  response: {
    status: StatusResult;
  };
}

export const discard: Handler = async (c) => {
  const { filepaths } = await c.req.json() as CheckoutAPI["body"];

  await git.fetch(["-p"]);

  await resetToMergeBase();

  const status = await git
    .checkout(
      filepaths.map((path) => path.startsWith("/") ? path.slice(1) : path),
    )
    .status();

  return Response.json({ status });
};

export interface RebaseAPI {
  response: {
    status: StatusResult;
  };
}

const abortRebase = async () => {
  await git.rebase({ "--abort": null });
  throw new Error(
    "Something went very wrong during rebase. You should rebase manually by cloning the repo",
  );
};

const resolveConflictsRecursively = async (wip: number = 50) => {
  // Avoids infinite loop
  if (!wip) {
    await abortRebase();
  }

  try {
    const status = await git.status();

    for (const file of status.conflicted) {
      const summary = status.files.find((f) => f.path === file);

      if (!summary) {
        await abortRebase();
      }

      if (summary?.working_dir === "D") {
        await git.rm(file);
      } else {
        await git.add(file);
      }
    }

    const after = await git.status();
    if (after.conflicted.length !== 0) {
      await abortRebase();
    }

    await git.rebase({ "--continue": null });
  } catch (error) {
    // We should never enter this `if` in normal circumstances
    if (!error.message?.includes("CONFLICT")) {
      console.error(error);
      await abortRebase();
    }

    await resolveConflictsRecursively();
  }
};

/**
 * Rebases with -XTheirs strategy. If conflicts are found, it will try to resolve them automatically.
 * Conflicts happen when someone deletes a file and you modify it, or when you modify a file and someone else modifies it.
 * In this case, the strategy is to keep the changes the current branch has.
 */
export const rebase: Handler = async () => {
  try {
    await git
      .fetch(["-p"])
      .add(".")
      .commit("Before rebase", { "--no-verify": null })
      .rebase({ "--strategy-option": "theirs" });
  } catch {
    await resolveConflictsRecursively();
  }

  await resetToMergeBase();

  return Response.json({ status: await git.status() });
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
  const assertNoIndexLock = async () => {
    const isDeployment = typeof DENO_DEPLOYMENT_ID === "string";
    if (!isDeployment) {
      return;
    }
    const lockIndexPath = join(Deno.cwd(), ".git/index.lock");
    // index.lock should not exists as it means that another git process is running or it is unterminated (non-atomic operations.)
    const hasGitIndexLock = await Deno.stat(lockIndexPath)
      .then(() => true)
      .catch((e) => e instanceof Deno.errors.NotFound ? false : true);
    if (hasGitIndexLock) {
      console.log(
        "deleting .git/index.lock as this should not exist on deployment startup",
      );
      await Deno.remove(lockIndexPath);
    }
  };
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
      await resetToMergeBase();
      return;
    }

    await git.clone(REPO_URL ?? `git@github.com:deco-sites/${site}.git`, ".", [
      "--depth",
      "1",
      "--single-branch",
      "--branch",
      DEFAULT_TRACKING_BRANCH,
    ]);
  };

  await assertNoIndexLock();
  await Promise.all([
    assertGitBinary(),
    assertGitFolder(),
  ]);
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
