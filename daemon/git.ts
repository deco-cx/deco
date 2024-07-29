import fs from "node:fs";
// import { git, http } from "./deps.ts";

const dir = Deno.cwd();

const decoder = new TextDecoder();

// git fetch -p
const gitFetchP = () =>
  git.fetch({
    fs,
    http,
    dir,
    depth: 5,
    prune: true,
    pruneTags: true,
  });

// git reset .
const gitResetDot = async () => {
  const matrix = await git.statusMatrix({ fs, dir });

  // Reset all staged files
  await Promise.all(
    matrix
      .filter(([_filepath, _head, _workdir, stage]) => stage !== 1)
      .map(([filepath]) => git.resetIndex({ fs, dir, filepath })),
  );
};

const resolveRefs = async () => {
  const branch = await git.currentBranch({ fs, dir });

  if (!branch) {
    throw new Error("Missing branch");
  }

  const [ours, theirs] = await Promise.all([
    git.resolveRef({ fs, dir, ref: branch }),
    git.resolveRef({ fs, dir, ref: `origin/${branch}` }),
  ]);

  const [base] = await git.findMergeBase({
    fs,
    dir,
    oids: [ours, theirs],
  });

  if (!base) {
    throw new Error("Missing merge base!");
  }

  return { ours, theirs, base };
};

interface GitDiff {
  /** filename path */
  path: string;
  /** git hash */
  oid: string;
  /** file content on the upstream branch */
  from: string | undefined;
  /** changed file content */
  to: string | undefined;
  /** last modified content at (seconds) */
  mtime: number | null;
}

export interface ChangesetAPI {
  response: GitDiff[];
}

const rebaseAndResetBranches = async () => {
  // git fetch -p
  await gitFetchP();

  // git reset .
  await gitResetDot();

  const { ours, theirs, base } = await resolveRefs();

  const matrix = await git.statusMatrix({ fs, dir, ref: base });
  await Promise.all(
    matrix
      .filter(([_filepath, _head, workdir, _stage]) => workdir !== 1)
      .map(([filepath]) => git.resetIndex({ fs, dir, filepath, ref: base })),
  );

  // console.log((await git.log({ fs, dir })).map((x) => x.oid));

  // await git.writeRef({ fs, dir, ref: "HEAD", value: base, force: true });
  // await git.writeRef({ fs, dir, ref: "main", value: base, force: true });

  // console.log(await git.fastForward({ fs, http, dir }));
  // await gitResetDot()
  // await git.checkout({ fs, dir, ref: commonRef });

  // await git.updateIndex({
  //   fs,
  //   dir,
  //   filepath: ".",
  //   oid: commonRef,
  //   add: true,
  //   remove: true,
  // });

  console.log({ ours, theirs, base });

  // await git.writeRef({ fs, dir, ref: ours, value: theirs });

  // await git.add({ fs, dir, filepath: "." });
  // git reset .
  // await git.resetIndex({ fs, dir, filepath: "." });
  // // git commit -m "Rebase"
  // await git.commit({ fs, dir, message: "Rebase" });
};

rebaseAndResetBranches().catch(console.error);

const changeset = async () => {
  // git fetch -p
  await gitFetchP();

  // git reset .
  await gitResetDot();

  const { base } = await resolveRefs();

  // Resolve changed filepaths
  const matrix = await git.statusMatrix({ fs, dir, ref: base });
  const filepaths = matrix
    .filter(([_filepath, _head, workdir, _stage]) => workdir !== 1)
    .map(([filepath]) => filepath);

  const changeSetFiles = new Set(filepaths);
  const changeSetTree = new Set(
    filepaths.flatMap((filepath) => {
      const segments = filepath.split("/");
      return segments.map((_, index) => segments.slice(0, index + 1).join("/"));
    }),
  );

  changeSetTree.add(".");

  // this API requires you to return something to keep visiting a subtree
  const subtree: GitDiff[] = await git.walk({
    fs,
    dir,
    trees: [git.WORKDIR(), git.TREE({ ref: base })],
    map: async (
      path: string,
      [workdir, tree]: Array<git.WalkerEntry | null>,
    ) => {
      if (!changeSetTree.has(path)) {
        return null;
      }

      const [workdirBytes, workdirStat, treeBytes] = await Promise.all([
        workdir?.content(),
        workdir?.stat(),
        tree?.content(),
      ]);

      return {
        path,
        oid: await tree?.oid(),
        from: treeBytes ? decoder.decode(treeBytes) : undefined,
        to: workdirBytes ? decoder.decode(workdirBytes) : undefined,
        // last time the file was modified: https://git-scm.com/docs/index-format/2.31.0#:~:text=32%2Dbit%20mtime%20seconds
        mtime: workdirStat?.mtimeSeconds,
      };
    },
  });

  const changeSet = subtree.filter((entry) => changeSetFiles.has(entry.path));

  return new Response(JSON.stringify(changeSet), {
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

  const matrix = await git.statusMatrix({ fs, dir });

  // Add all unstaged files
  await Promise.all(
    matrix
      .filter(([_filepath, _head, workdir, _stage]) => workdir !== 1)
      .map(([filepath]) => git.add({ fs, dir: dir, filepath })),
  );

  // commit & push
  const oid = await git.commit({ fs, dir, message, author });
  await git.push({ fs, http, dir, ref: "HEAD" });

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

  await Promise.all(
    filepaths.map((filepath) =>
      git.resetIndex({ fs, dir, ref: "HEAD", filepath })
    ),
  );

  return new Response(null, { status: 204 });
};

export interface RebaseAPI {
}

const rebase = async () => {
  await gitFetchP();

  const currentBranch = await git.currentBranch({ fs, dir, fullname: false });

  await git.fastForward({
    fs,
    dir,
    http,
    remoteRef: currentBranch ?? "main",
  });

  console.log("forwarded e agora?");

  return new Response(null, { status: 204 });
};

export interface PublishableAPI {
  response: {
    status: "ahead" | "behind" | "diverged" | "up-to-date";
    localHash: string;
    remoteHash: string;
  };
}

const canPublish = async (_req: Request) => {
  // Step 1: Fetch the latest changes from the remote
  await gitFetchP();

  // Step 2: Get the current branch name
  const currentBranch = await git.currentBranch({ fs, dir, fullname: false });
  const ref = currentBranch ?? "HEAD";

  // Step 3: Get the commit hashes of the local and remote branches
  const localHash = await git.resolveRef({ fs, dir, ref });
  const remoteHash = await git.resolveRef({ fs, dir, ref: `origin/${ref}` });

  // Step 4: Compare the local branch with the remote branch
  const isAhead = await git.isDescendent({
    fs,
    dir,
    oid: localHash,
    ancestor: remoteHash,
  });
  const isBehind = await git.isDescendent({
    fs,
    dir,
    oid: remoteHash,
    ancestor: localHash,
  });

  const status = isAhead && !isBehind
    ? "ahead"
    : !isAhead && isBehind
    ? "behind"
    : !isAhead && !isBehind && localHash !== remoteHash
    ? "diverged"
    : "up-to-datse";

  return new Response(JSON.stringify({ status, localHash, remoteHash }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};

export const handler = async (req: Request) => {
  const url = new URL(req.url);

  try {
    if (url.pathname.startsWith("/git/changeset")) {
      return await changeset();
    }

    if (url.pathname.startsWith("/git/publish")) {
      return req.method === "GET" ? await canPublish(req) : await publish(req);
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
