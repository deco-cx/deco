import { GIT, Hono, HTTPException } from "./deps.ts";

const git = GIT.simpleGit(Deno.cwd(), {
  maxConcurrentProcesses: 1,
  trimmed: true,
});
const DEFAULT_TRACKING_BRANCH = Deno.env.get("DECO_DEFAULT_TRACKING_BRANCH") ??
  "main";
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
  response: GIT.DiffResult;
}

export interface GitStatusAPI {
  response: Omit<GIT.StatusResult, "files"> & {
    files: Array<
      GIT.FileStatusResult & {
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
export const status: Hono.Handler = async (c) => {
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
  response: GIT.PushResult;
}

// TODO: maybe tag with versions!
export const publish: Hono.Handler = async (c) => {
  const { message, author } = await c.req.json() as PublishAPI["body"];

  await git.fetch(["-p"]);

  const base = await getMergeBase();

  const result = await git
    .reset(["."])
    .reset([base])
    .add(["."])
    .commit(message, {
      "--author": `${author.name} <${author.email}>`,
      "--no-verify": null,
    })
    .push();

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};

export interface CheckoutAPI {
  body: {
    filepaths: string[];
  };
}

export const discard: Hono.Handler = async (c) => {
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

export const rebase: Hono.Handler = async () => {
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
  response: GIT.LogResult;
  searchParams: {
    limit?: number;
  };
}

export const log: Hono.Handler = async (c) => {
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

let hasGit = false;
export const ensureGit: Hono.MiddlewareHandler = async (_, next) => {
  if (hasGit) {
    return next();
  }

  try {
    const cmd = new Deno.Command("git", {
      args: ["--version"],
      stdout: "piped",
    });

    await cmd.spawn().status;

    hasGit = true;

    return next();
  } catch {
    const msg =
      "Deco preview server requires GIT to be installed in your system but none was found. Please install it and add it to your PATH.";

    console.warn(`\nFatal error:\n${msg}\n`);
    throw new HTTPException(424, {
      res: new Response(msg, { status: 424 }),
    });
  }
};

const app = new Hono.Hono();

app.use("/*", ensureGit);
app.get("/status", status);
app.get("/log", log);
app.post("/publish", publish);
app.post("/discard", discard);
app.post("/rebase", rebase);

export default app;
