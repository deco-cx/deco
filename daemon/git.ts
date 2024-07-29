import { GIT } from "./deps.ts";

const git = GIT.simpleGit(Deno.cwd());

const getMergeBase = async () => {
  const { all: [local, upstream] } = await git.branch();

  if (!local || !upstream) {
    throw new Error(`Missing local or upstream branches`);
  }

  const base = await git.raw("merge-base", local, upstream);

  return base.trim();
};

export interface GitDiffAPI {
  response: GIT.DiffResult;
}

/** Diff between current state and upstream latest common commit */
const diff = async () => {
  await git.fetch(["-p"]);

  const base = await getMergeBase();
  const { files } = await git.diffSummary([base]);

  const changeset = await Promise.all(files.map(async (fileDiff) => ({
    ...fileDiff,
    ...fileDiff.binary === false && {
      from: await git.show(`${base}:${fileDiff.file}`),
      to: fileDiff.binary === false &&
        await Deno.readTextFile(fileDiff.file).catch(() => null),
    },
  })));

  return new Response(JSON.stringify(changeset), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
  });
};

export interface GitStatusAPI {
  response: GIT.StatusResult;
}

/** Git status */
const status = async () => {
  await git.fetch(["-p"]);

  const status = await git.status();

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
  response: {
    oid: string;
  };
}

const publish = async (req: Request) => {
  const { message, author } = await req.json() as PublishAPI["body"];

  await git.fetch(["-p"]);

  const base = await getMergeBase();

  const result = await git
    .reset(["."])
    .reset([base])
    .add(["."])
    .commit(message, {
      "--author": `${author.name} <${author.email}>`,
    })
    .push();

  console.log({ result });

  return new Response(JSON.stringify({ oid }), {
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

  await git.fetch(["-p"]);

  const base = await getMergeBase();

  git.reset(["."])
    .reset([base])
    .checkout(filepaths);

  return new Response(null, { status: 204 });
};

export interface RebaseAPI {
}

const rebase = async () => {
  await git
    .fetch(["-p"])
    .add(".")
    .commit("Before rebase")
    .pull({ "--rebase": null, "--strategy-option": "theirs" });

  const base = await getMergeBase();
  await git.reset([base]);

  return new Response(null, { status: 204 });
};

export const handler = async (req: Request) => {
  const url = new URL(req.url);

  try {
    if (url.pathname.startsWith("/git/status")) {
      return await status();
    }

    if (url.pathname.startsWith("/git/diff")) {
      return await diff();
    }

    if (url.pathname.startsWith("/git/publish")) {
      return await publish(req);
    }

    if (url.pathname.startsWith("/git/discard")) {
      return await discard(req);
    }

    if (url.pathname.startsWith("/git/rebase")) {
      return await rebase();
    }

    return new Response("No such route", { status: 404 });
  } catch (error) {
    console.error(error);

    return new Response(null, { status: 500 });
  }
};
