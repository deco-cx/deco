import { GIT } from "./deps.ts";

const git = GIT.simpleGit(Deno.cwd(), {
  maxConcurrentProcesses: 1,
  trimmed: true,
});

const getMergeBase = async () => {
  const { all: [local, upstream] } = await git.branch();

  if (!local || !upstream) {
    throw new Error(`Missing local or upstream branches`);
  }

  const base = await git.raw("merge-base", local, upstream);

  return base;
};

export interface GitDiffAPI {
  response: GIT.DiffResult;
}

export interface GitStatusAPI {
  response: GIT.StatusResult;
  searchParams: {
    diff?: boolean;
  };
}

/** Git status */
const status = async (req: Request) => {
  const url = new URL(req.url);
  const includeDiff = url.searchParams.get("diff") === "true";

  req.signal.throwIfAborted();
  const base = await getMergeBase();

  req.signal.throwIfAborted();
  const status = await git
    .reset(["."])
    .reset([base])
    .status();

  if (includeDiff) {
    req.signal.throwIfAborted();
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
const publish = async (req: Request) => {
  const { message, author } = await req.json() as PublishAPI["body"];

  req.signal.throwIfAborted();
  await git.fetch(["-p"]);

  req.signal.throwIfAborted();
  const base = await getMergeBase();

  req.signal.throwIfAborted();
  const result = await git
    .reset(["."])
    .reset([base])
    .add(["."])
    .commit(message, {
      "--author": `${author.name} <${author.email}>`,
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

const discard = async (req: Request) => {
  const { filepaths } = await req.json() as CheckoutAPI["body"];

  req.signal.throwIfAborted();
  await git.fetch(["-p"]);

  req.signal.throwIfAborted();
  const base = await getMergeBase();

  req.signal.throwIfAborted();
  git.reset(["."])
    .reset([base])
    .checkout(filepaths);

  return new Response(null, { status: 204 });
};

export interface RebaseAPI {
}

const rebase = async (req: Request) => {
  req.signal.throwIfAborted();
  await git
    .fetch(["-p"])
    .add(".")
    .commit("Before rebase")
    .pull({ "--rebase": null, "--strategy-option": "theirs" });

  req.signal.throwIfAborted();
  const base = await getMergeBase();

  req.signal.throwIfAborted();
  await git.reset([base]);

  return new Response(null, { status: 204 });
};

type Handler = (req: Request) => Promise<Response>;
type HTTPVerbs = "GET" | "POST";

const routes: Record<string, Partial<Record<HTTPVerbs, Handler>>> = {
  "/git/status": {
    GET: status,
  },
  "/git/publish": {
    POST: publish,
  },
  "/git/discard": {
    POST: discard,
  },
  "/git/rebase": {
    POST: rebase,
  },
};

// On client closed the connection, respond a 499
// TODO: move this to other Hypervisor APIs
const aborted = async (req: Request) => {
  await new Promise((resolve) => req.signal.addEventListener("abort", resolve));

  return new Response(null, { status: 499 });
};

let hasGit = false;
const ensureGit = async () => {
  if (hasGit) {
    return;
  }

  try {
    const cmd = new Deno.Command("git", {
      args: ["--version"],
      stdout: "piped",
    });

    const process = await cmd.spawn();
    await process.status;

    hasGit = true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw new Error("GIT_NOT_FOUND");
    }

    throw error;
  }
};

export const handler = async (req: Request) => {
  const url = new URL(req.url);

  try {
    const route = routes[url.pathname][req.method as HTTPVerbs];

    if (!route) {
      return new Response("No such route", { status: 404 });
    }

    await ensureGit();

    const response = await Promise.race([route(req), aborted(req)]);

    return response;
  } catch (error) {
    if (error.message === "GIT_NOT_FOUND") {
      const msg =
        "Deco preview server requires GIT to be installed in your system but none was found. Please install it and add it to your PATH.";

      console.warn(`\nFatal error:\n${msg}\n`);
      return new Response(msg, { status: 424 });
    }

    return new Response(error.message || "Internal Server Error", {
      status: 500,
    });
  }
};
