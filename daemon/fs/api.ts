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

const inferMetadata = async (filepath: string): Promise<Metadata | null> => {
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
  response: {
    results: Array<{
      filepath: string;
      matches: Array<{
        lineNumber: number;
        line: string;
        columnStart: number;
        columnEnd: number;
      }>;
    }>;
    total: number;
  };
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
  try {
    const walker = walk(Deno.cwd(), { includeDirs: false, includeFiles: true });

    for await (const entry of walker) {
      if (shouldIgnore(entry.path)) {
        continue;
      }

      const [metadata, mtime] = await Promise.all([
        inferMetadata(entry.path),
        mtimeFor(entry.path),
      ]);

      if (
        !metadata || mtime < since
      ) {
        continue;
      }

      const filepath = browserPathFromSystem(entry.path);
      yield {
        type: "fs-sync",
        detail: { metadata, filepath, timestamp: mtime },
      };
    }

    yield {
      type: "fs-snapshot",
      detail: { timestamp: Date.now(), status: await git.status() },
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

const grepInFile = async (filepath: string, pattern: RegExp): Promise<
  {
    filepath: string;
    matches: Array<{
      lineNumber: number;
      line: string;
      columnStart: number;
      columnEnd: number;
    }>;
  } | null
> => {
  try {
    const content = await Deno.readTextFile(filepath);
    const lines = content.split("\n");
    const matches = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let match;

      // Reset regex lastIndex for global patterns
      pattern.lastIndex = 0;

      while ((match = pattern.exec(line)) !== null) {
        matches.push({
          lineNumber: i + 1,
          line: line,
          columnStart: match.index,
          columnEnd: match.index + match[0].length,
        });

        // If not global flag, break after first match
        if (!pattern.global) break;
      }
    }

    return matches.length > 0
      ? {
        filepath: browserPathFromSystem(filepath),
        matches,
      }
      : null;
  } catch (error) {
    // Skip files that can't be read (binary, permissions, etc)
    if (VERBOSE) {
      console.error(`Error reading file ${filepath}:`, error);
    }
    return null;
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
    const {
      query,
      includePattern,
      excludePattern,
      caseInsensitive,
      isRegex,
      limit,
    } = await c.req.query();

    if (!query) {
      c.status(400);
      return c.json({ error: "Query parameter 'q' is required" });
    }

    try {
      let pattern: RegExp;

      if (isRegex) {
        const flags = caseInsensitive ? "gi" : "g";
        pattern = new RegExp(query, flags);
      } else {
        // Escape special regex characters for literal search
        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const flags = caseInsensitive ? "gi" : "g";
        pattern = new RegExp(escapedQuery, flags);
      }

      const results = [];
      let total = 0;
      const walker = walk(Deno.cwd(), {
        includeDirs: false,
        includeFiles: true,
        match: includePattern !== "*"
          ? [new RegExp(includePattern)]
          : undefined,
        skip: excludePattern ? [new RegExp(excludePattern)] : undefined,
      });

      for await (const entry of walker) {
        if (shouldIgnore(entry.path)) {
          continue;
        }

        // Skip non-text files based on extension
        const ext = entry.path.split(".").pop()?.toLowerCase();
        const textExtensions = [
          "ts",
          "tsx",
          "js",
          "jsx",
          "json",
          "md",
          "txt",
          "css",
          "scss",
          "sass",
          "html",
          "htm",
          "xml",
          "yml",
          "yaml",
          "toml",
          "ini",
          "conf",
          "config",
          "py",
          "rb",
          "go",
          "rs",
          "java",
          "c",
          "cpp",
          "h",
          "hpp",
          "cs",
          "php",
          "sh",
          "bash",
          "zsh",
          "fish",
          "ps1",
          "sql",
          "graphql",
          "gql",
          "proto",
          "dockerfile",
          "makefile",
          "gitignore",
          "editorconfig",
          "env",
        ];

        if (
          ext && !textExtensions.includes(ext) && !entry.name.startsWith(".")
        ) {
          continue;
        }

        const result = await grepInFile(entry.path, pattern);
        if (result) {
          results.push(result);
          total += result.matches.length;

          if (results.length >= Number(limit)) {
            break;
          }
        }
      }

      return c.json({ results, total });
    } catch (error) {
      console.error("Grep error:", error);
      c.status(500);
      return c.json({ error: "Internal server error during grep operation" });
    }
  });

  return app;
};
