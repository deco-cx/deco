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

// Check if system grep is available
let isSystemGrepAvailable: boolean | null = null;

const checkSystemGrep = async (): Promise<boolean> => {
  if (isSystemGrepAvailable !== null) {
    return isSystemGrepAvailable;
  }

  try {
    const cmd = new Deno.Command("grep", {
      args: ["--version"],
      stdout: "null",
      stderr: "null",
    });
    const { success } = await cmd.output();
    isSystemGrepAvailable = success;
    return success;
  } catch {
    isSystemGrepAvailable = false;
    return false;
  }
};

const systemGrep = async (
  query: string,
  options: {
    caseInsensitive?: boolean;
    isRegex?: boolean;
    includePattern?: string;
    excludePattern?: string;
    limit?: number;
  } = {},
): Promise<{
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
} | null> => {
  try {
    const args = [
      "-n", // line numbers
      "-H", // show filenames
      "--color=never", // no color codes
    ];

    if (options.caseInsensitive) {
      args.push("-i");
    }

    if (!options.isRegex) {
      args.push("-F"); // fixed strings (literal)
    }

    // Add include/exclude patterns
    if (options.includePattern && options.includePattern !== "*") {
      args.push("--include", options.includePattern);
    }

    if (options.excludePattern) {
      args.push("--exclude", options.excludePattern);
    }

    // Standard exclusions
    args.push(
      "--exclude-dir=.git",
      "--exclude-dir=node_modules",
      "--exclude-dir=.deco",
      "-r", // recursive
      query,
      ".", // search in current directory
    );

    const cmd = new Deno.Command("grep", {
      args,
      cwd: Deno.cwd(),
      stdout: "piped",
      stderr: "null",
    });

    const { stdout, success } = await cmd.output();

    if (!success) {
      return { results: [], total: 0 };
    }

    const output = new TextDecoder().decode(stdout);
    const lines = output.trim().split("\n").filter(line => line.length > 0);

    const results: Map<string, {
      filepath: string;
      matches: Array<{
        lineNumber: number;
        line: string;
        columnStart: number;
        columnEnd: number;
      }>;
    }> = new Map();

    let total = 0;
    let fileCount = 0;

    for (const line of lines) {
      const colonIndex = line.indexOf(":");
      const secondColonIndex = line.indexOf(":", colonIndex + 1);
      
      if (colonIndex === -1 || secondColonIndex === -1) continue;

      const filepath = line.substring(0, colonIndex);
      const lineNumber = parseInt(line.substring(colonIndex + 1, secondColonIndex));
      const content = line.substring(secondColonIndex + 1);

      const browserPath = browserPathFromSystem(filepath);
      
      if (!results.has(browserPath)) {
        if (fileCount >= (options.limit || 100)) {
          break;
        }
        results.set(browserPath, {
          filepath: browserPath,
          matches: [],
        });
        fileCount++;
      }

      const fileResult = results.get(browserPath)!;
      
      // Find match positions in the line
      let columnStart = 0;
      let columnEnd = content.length;
      
      if (options.isRegex) {
        const flags = options.caseInsensitive ? "gi" : "g";
        const pattern = new RegExp(query, flags);
        const match = pattern.exec(content);
        if (match) {
          columnStart = match.index;
          columnEnd = match.index + match[0].length;
        }
      } else {
        const searchTerm = options.caseInsensitive ? query.toLowerCase() : query;
        const searchLine = options.caseInsensitive ? content.toLowerCase() : content;
        const index = searchLine.indexOf(searchTerm);
        if (index !== -1) {
          columnStart = index;
          columnEnd = index + query.length;
        }
      }

      fileResult.matches.push({
        lineNumber,
        line: content,
        columnStart,
        columnEnd,
      });
      total++;
    }

    return {
      results: Array.from(results.values()),
      total,
    };
  } catch (error) {
    if (VERBOSE) {
      console.error("System grep failed:", error);
    }
    return null;
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

const fallbackGrep = async (
  query: string,
  options: {
    caseInsensitive?: boolean;
    isRegex?: boolean;
    includePattern?: string;
    excludePattern?: string;
    limit?: number;
  } = {},
): Promise<{
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
}> => {
  let pattern: RegExp;
  
  if (options.isRegex) {
    const flags = options.caseInsensitive ? "gi" : "g";
    pattern = new RegExp(query, flags);
  } else {
    // Escape special regex characters for literal search
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const flags = options.caseInsensitive ? "gi" : "g";
    pattern = new RegExp(escapedQuery, flags);
  }

  const results = [];
  let total = 0;
  const walker = walk(Deno.cwd(), {
    includeDirs: false,
    includeFiles: true,
    match: options.includePattern && options.includePattern !== "*"
      ? [new RegExp(options.includePattern)]
      : undefined,
    skip: options.excludePattern ? [new RegExp(options.excludePattern)] : undefined,
  });

  for await (const entry of walker) {
    if (shouldIgnore(entry.path)) {
      continue;
    }

    // Skip non-text files based on extension
    const ext = entry.path.split(".").pop()?.toLowerCase();
    const textExtensions = [
      "ts", "tsx", "js", "jsx", "json", "md", "txt", "css", "scss", "sass",
      "html", "htm", "xml", "yml", "yaml", "toml", "ini", "conf", "config",
      "py", "rb", "go", "rs", "java", "c", "cpp", "h", "hpp", "cs", "php",
      "sh", "bash", "zsh", "fish", "ps1", "sql", "graphql", "gql", "proto",
      "dockerfile", "makefile", "gitignore", "editorconfig", "env",
    ];

    if (ext && !textExtensions.includes(ext) && !entry.name.startsWith(".")) {
      continue;
    }

    const result = await grepInFile(entry.path, pattern);
    if (result) {
      results.push(result);
      total += result.matches.length;

      if (results.length >= (options.limit || 100)) {
        break;
      }
    }
  }

  return { results, total };
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
    const query = c.req.query("q");
    const includePattern = c.req.query("include") || "*";
    const excludePattern = c.req.query("exclude");
    const caseInsensitive = c.req.query("case-insensitive") === "true";
    const isRegex = c.req.query("regex") === "true";
    const limit = parseInt(c.req.query("limit") || "100");

    if (!query) {
      c.status(400);
      return c.json({ error: "Query parameter 'q' is required" });
    }

    try {
      const options = {
        caseInsensitive,
        isRegex,
        includePattern,
        excludePattern,
        limit,
      };

      // Try system grep first
      const hasSystemGrep = await checkSystemGrep();
      
      if (hasSystemGrep) {
        if (VERBOSE) {
          console.log("Using system grep for query:", query);
        }
        
        const systemResult = await systemGrep(query, options);
        
        if (systemResult !== null) {
          return c.json(systemResult);
        }
        
        if (VERBOSE) {
          console.log("System grep failed, falling back to JavaScript implementation");
        }
      } else if (VERBOSE) {
        console.log("System grep not available, using JavaScript implementation");
      }

      // Fallback to JavaScript implementation
      const fallbackResult = await fallbackGrep(query, options);
      return c.json(fallbackResult);

    } catch (error) {
      console.error("Grep error:", error);
      c.status(500);
      return c.json({ error: "Internal server error during grep operation" });
    }
  });

  return app;
};
