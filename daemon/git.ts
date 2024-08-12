import { type Handler, Hono, type MiddlewareHandler } from "@hono/hono";
import { ensureDir } from "@std/fs";
import { basename, dirname, join } from "@std/path";
import {
  type DiffResult,
  type FileStatusResult,
  GitConfigScope,
  type LogResult,
  type PushResult,
  simpleGit,
  type StatusResult,
} from "simple-git";

const SOURCE_PATH = Deno.env.get("SOURCE_ASSET_PATH");

const git = simpleGit(Deno.cwd(), {
  maxConcurrentProcesses: 1,
  trimmed: true,
  progress: ({ method, stage, progress }) =>
    console.log(`git.${method} ${stage} stage ${progress}% complete`),
});

/** Make sure we have a git on k8s before doing anything. */
export const ensureGitFolder = async (remote: string) => {
  const hasGitFolder = await Deno.stat(join(Deno.cwd(), ".git"))
    .then(() => true)
    .catch((e) => e instanceof Deno.errors.NotFound ? false : true);

  if (hasGitFolder) {
    console.log("Git folder already exists, skipping init");
    return;
  }

  console.time("Initializing git folder...");

  await git
    .init({ "-b": "main" })
    .addRemote("origin", remote)
    .add(".")
    .commit("Initial commit", { "--no-verify": null })
    .pull({ "--rebase": null, "--strategy-option": "theirs" });

  console.timeEnd("Initializing git folder...");
};

const getMergeBase = async () => {
  const status = await git.status();
  const current = status.current;
  const tracking = status.tracking || "main";

  if (!current || !tracking) {
    throw new Error(`Missing local or upstream branches`);
  }

  const base = await git.raw("merge-base", current, tracking);

  return base;
};

export interface GitDiffAPI {
  response: DiffResult;
}

export interface GitStatusAPI {
  response: Omit<StatusResult, "files"> & {
    files: Array<
      FileStatusResult & {
        from: string | undefined;
        to: string | undefined;
      }
    >;
  };
  searchParams: {
    diff?: boolean;
  };
}

/** Git status */
export const status: Handler = async (c) => {
  const url = new URL(c.req.url);
  const includeDiff = url.searchParams.get("diff") === "true";

  const base = await getMergeBase();

  const status = await git
    .reset(["."])
    .reset([base])
    .status();

  if (includeDiff) {
    status.files = await Promise.all(
      status.files.map(async (file) => {
        const [from, to] = await Promise.all([
          git.show(`${base}:${file.path}`).catch(() => undefined),
          Deno.readTextFile(file.path).catch(() => undefined),
        ]);

        return { ...file, from, to };
      }),
    );
  }

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
    const { message, author } = await c.req.json() as PublishAPI["body"];

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

  git.reset(["."])
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

    if (hasGitFolder) {
      return console.log("Git folder already exists, skipping init");
    }

    await setupGlobals()
      .clone(`git@github.com:deco-sites/${site}.git`, ".", [
        "--depth",
        "1",
        "--single-branch",
        "--branch",
        "main",
      ]);
  };

  await Promise.all([assertGitBinary(), assertGitFolder()]);
};

const setupGlobals = () =>
  git
    .addConfig("safe.directory", Deno.cwd(), false, GitConfigScope.global)
    .addConfig("push.autoSetupRemote", "true", false, GitConfigScope.global)
    .addConfig("user.name", "decobot", false, GitConfigScope.global)
    .addConfig("user.email", "capy@deco.cx", false, GitConfigScope.global);

const setupGitConfig = (): MiddlewareHandler => {
  let ok: Promise<unknown> | null = null;

  return async (c, next) => {
    try {
      ok ||= setupGlobals();

      await ok.then(next);
    } catch (error) {
      console.error(error);

      ok = null;
      c.res = new Response(`Error while setting up git`, {
        status: 424,
      });
    }
  };
};

interface Options {
  build: Deno.Command | null;
  site: string;
}

export const createGitAPIS = (options: Options) => {
  const app = new Hono();

  app.use(setupGitConfig());
  app.get("/status", status);
  app.get("/log", log);
  app.post("/publish", publish(options));
  app.post("/discard", discard);
  app.post("/rebase", rebase);

  return app;
};
