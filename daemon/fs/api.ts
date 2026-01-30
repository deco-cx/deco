import { ensureFile, walk } from "@std/fs";
import { basename, join, SEPARATOR } from "@std/path";
import type { StatusResult } from "simple-git";
import { createReadWriteLock, type RwLock } from "../../daemon/async.ts";
import { Hono } from "../../runtime/deps.ts";
import { git, lockerGitAPI } from "../git.ts";
import { VERBOSE } from "../main.ts";
import { inferBlockType } from "../meta.ts";
import { broadcast } from "../sse/channel.ts";
import {
  applyPatch,
  type FSEvent,
  type Metadata,
  type Patch,
  type UpdateResponse,
} from "./common.ts";
import { grep, type GrepResult } from "./grep.ts";

// Directories to skip when walking (expensive to enumerate)
const SKIP_DIRS = [
  "node_modules",
  ".git",
  "_fresh",
  ".next",
  "dist",
  ".deno",
  ".cache",
];

// Large generated files to skip (reading them is expensive)
const SKIP_FILES = [
  "schemas.gen.json",
  "manifest.gen.ts",
  "fresh.gen.ts",
];

const inferMetadata = async (filepath: string): Promise<Metadata | null> => {
  // Only JSON files can be blocks - skip reading other files entirely
  if (!filepath.endsWith(".json")) {
    return { kind: "file" };
  }

  try {
    const { __resolveType, name, path } = JSON.parse(
      await Deno.readTextFile(filepath),
    );
    const blockType = await inferBlockType(__resolveType);

    if (!blockType) {
      return { kind: "file" };
    }

    if (blockType === "pages") {
      return {
        kind: "block",
        name: name,
        path: path,
        blockType,
        __resolveType,
      };
    }

    return {
      kind: "block",
      blockType,
      __resolveType,
    };
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return null;
    }
    return { kind: "file" };
  }
};

const mtimeFor = async (filepath: string) => {
  try {
    const stats = await Deno.stat(filepath);

    return stats.mtime?.getTime() ?? Date.now();
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return Date.now();
    }
    throw error;
  }
};

const onNotFound = <T>(fallback: T) => (error: unknown) => {
  if (error instanceof Deno.errors.NotFound) {
    return fallback;
  }
  throw error;
};

export interface ListAPI {
  response: {
    metas: Array<{
      filepath: string;
      metadata: Metadata;
      timestamp: number;
    }>;
    status: StatusResult;
  };
}

export interface ReadAPI {
  response: {
    content: string;
    metadata: Metadata;
    timestamp: number;
  };
}

export interface PatchAPI {
  response: UpdateResponse;
  body: { patch: Patch; timestamp: number };
}

export interface DeleteAPI {
  response: UpdateResponse;
}

export interface GrepAPI {
  response: GrepResult;
}

const shouldIgnore = (path: string) =>
  basename(path) !== ".gitignore" &&
    path.includes(`${SEPARATOR}.git`) ||
  path.includes(`${SEPARATOR}node_modules${SEPARATOR}`);

const systemPathFromBrowser = (pathAndQuery: string) => {
  const [url] = pathAndQuery.split("?");
  const [_, ...segments] = url.split("/file");
  const s = segments.join("/file");

  return join(Deno.cwd(), "/", s);
};

const browserPathFromSystem = (filepath: string) =>
  filepath.replace(Deno.cwd(), "").replaceAll(SEPARATOR, "/");

export async function* start(since: number): AsyncIterableIterator<FSEvent> {
  const totalStart = performance.now();
  let fileCount = 0;
  let yieldedCount = 0;

  // Escape special regex characters
  const escapeRegex = (str: string) =>
    str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Build skip regex from SKIP_DIRS with proper escaping
  const escapedSeparator = escapeRegex(SEPARATOR);
  const escapedDirs = SKIP_DIRS.map(escapeRegex).join("|");
  const skipRegex = new RegExp(
    `(^|${escapedSeparator})(${escapedDirs})($|${escapedSeparator})`,
  );

  try {
    for await (
      const entry of walk(Deno.cwd(), {
        includeDirs: false,
        includeFiles: true,
        followSymlinks: false,
        skip: [skipRegex],
      })
    ) {
      fileCount++;

      // Skip non-relevant files and large generated files
      if (
        shouldIgnore(entry.path) ||
        SKIP_FILES.some((f) => entry.path.endsWith(f))
      ) {
        continue;
      }

      const [metadata, mtime] = await Promise.all([
        inferMetadata(entry.path),
        mtimeFor(entry.path),
      ]);

      if (!metadata || mtime < since) {
        continue;
      }

      const filepath = browserPathFromSystem(entry.path);
      yieldedCount++;
      yield {
        type: "fs-sync",
        detail: { metadata, filepath, timestamp: mtime },
      };
    }

    const gitStart = performance.now();
    const status = await git.status();
    const gitTime = performance.now() - gitStart;

    console.log(
      `[fs/api start] files=${fileCount} yielded=${yieldedCount} git=${
        gitTime.toFixed(0)
      }ms total=${(performance.now() - totalStart).toFixed(0)}ms`,
    );

    yield {
      type: "fs-snapshot",
      detail: { timestamp: Date.now(), status },
    };
  } catch (error) {
    console.error(error);
  }
}

export const watchFS = async () => {
  const watcher = Deno.watchFs(Deno.cwd(), { recursive: true });

  for await (const { kind, paths } of watcher) {
    if (kind !== "create" && kind !== "remove" && kind !== "modify") {
      continue;
    }

    const [filepath] = paths;

    if (shouldIgnore(filepath)) {
      continue;
    }
    if (VERBOSE) {
      console.log("file has changed", kind, paths);
    }

    const [status, metadata, mtime] = await Promise.all([
      git.status(),
      inferMetadata(filepath),
      mtimeFor(filepath),
    ]);

    broadcast({
      type: "fs-sync",
      detail: {
        status,
        metadata,
        timestamp: mtime,
        filepath: browserPathFromSystem(filepath),
      },
    });
  }
};

export const createFSAPIs = () => {
  const app = new Hono();

  const lockByPath = new Map<string, RwLock>();
  const getRwLock = (filepath: string) => {
    if (!lockByPath.has(filepath)) {
      lockByPath.set(filepath, createReadWriteLock());
    }

    return lockByPath.get(filepath);
  };

  app.use(lockerGitAPI.rlock);

  app.get("/file/*", async (c) => {
    const filepath = systemPathFromBrowser(c.req.raw.url);
    using _ = await getRwLock(filepath)?.rlock();

    try {
      const [
        metadata,
        content,
        stats,
      ] = await Promise.all([
        inferMetadata(filepath),
        Deno.readTextFile(filepath),
        Deno.stat(filepath),
      ]);

      const timestamp = stats.mtime?.getTime() ?? Date.now();

      return c.json({ content, metadata, timestamp });
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        c.status(404);
        return c.json({ timestamp: Date.now() });
      }
      throw error;
    }
  });

  app.patch("/file/*", async (c) => {
    const filepath = systemPathFromBrowser(c.req.raw.url);
    const {
      patch,
      timestamp: mtimeClient,
    } = await c.req.json<PatchAPI["body"]>();
    using _ = await getRwLock(filepath)?.wlock();

    const [mtimeBefore, content] = await Promise.all([
      mtimeFor(filepath),
      Deno.readTextFile(filepath).catch(onNotFound(null)),
    ]);

    const result = applyPatch(content, patch);

    if (!result.conflict && result.content) {
      await ensureFile(filepath);
      await Deno.writeTextFile(filepath, result.content);
    }

    const [status, metadata, mtimeAfter] = await Promise.all([
      git.status(),
      inferMetadata(filepath),
      mtimeFor(filepath),
    ]);

    const update: UpdateResponse = result.conflict
      ? { conflict: true, status, metadata, timestamp: mtimeAfter, content }
      : {
        conflict: false,
        status,
        metadata,
        timestamp: mtimeAfter,
        content: mtimeBefore !== mtimeClient ? result.content : undefined,
      };

    return c.json(update);
  });

  app.delete("/file/*", async (c) => {
    const filepath = systemPathFromBrowser(c.req.raw.url);
    using _ = await getRwLock(filepath)?.wlock();

    await Deno.remove(filepath);

    const update: UpdateResponse = {
      conflict: false,
      status: await git.status(),
      metadata: null,
      timestamp: Date.now(),
      content: undefined,
    };

    return c.json(update);
  });

  app.get("/grep", async (c) => {
    const query = c.req.query("query");

    const includePattern = c.req.query("includePattern") || "*";
    const excludePattern = c.req.query("excludePattern");
    const caseInsensitive = c.req.query("caseInsensitive") === "true";
    const isRegex = c.req.query("isRegex") === "true";
    const limit = parseInt(c.req.query("limit") || "100");
    const filepath = c.req.query("filepath");

    if (!query) {
      c.status(400);
      return c.json({ error: "Query parameter 'query' is required" });
    }

    try {
      const options = {
        caseInsensitive,
        isRegex,
        includePattern,
        excludePattern,
        limit,
        filepath,
      };

      const result = await grep(query, options);
      return c.json(result);
    } catch (_error) {
      return c.json({ error: "Internal server error during grep operation" });
    }
  });

  return app;
};
