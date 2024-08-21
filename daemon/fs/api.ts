import * as colors from "@std/fmt/colors";
import { ensureFile, walk } from "@std/fs";
import { join, SEPARATOR } from "@std/path";
import { createReadWriteLock, type RwLock } from "deco/daemon/async.ts";
import type { StatusResult } from "simple-git";
import { Hono } from "../../runtime/deps.ts";
import { sha1 } from "../../utils/sha1.ts";
import { git, lockerGitAPI } from "../git.ts";
import {
  applyPatch,
  type FSEvent,
  type Metadata,
  type Patch,
  type UpdateResponse,
} from "./common.ts";

const WELL_KNOWN_BLOCK_TYPES = new Set([
  "accounts",
  "actions",
  "apps",
  "flags",
  "handlers",
  "loaders",
  "matchers",
  "pages",
  "sections",
  "workflows",
]);

const inferBlockType = (resolveType: string) =>
  resolveType.split("/").find((s) => WELL_KNOWN_BLOCK_TYPES.has(s));

const inferMetadata = async (filepath: string): Promise<Metadata | null> => {
  try {
    const { __resolveType, name, path } = JSON.parse(
      await Deno.readTextFile(filepath),
    );
    const blockType = inferBlockType(__resolveType);

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

const stat = async (filepath: string) => {
  try {
    const stats = await Deno.stat(filepath);

    return stats;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return { mtime: new Date() };
    }
    throw error;
  }
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
  body: { patch: Patch; hash: string };
}

export interface DeleteAPI {
  response: UpdateResponse;
}

const shouldIgnore = (path: string) =>
  path.includes("/.git/") ||
  path.includes("/node_modules/");

export const createFSAPIs = () => {
  const app = new Hono();
  const cwd = Deno.cwd();

  const sockets: WebSocket[] = [];

  const lockByPath = new Map<string, RwLock>();
  const getRwLock = (filepath: string) => {
    if (!lockByPath.has(filepath)) {
      lockByPath.set(filepath, createReadWriteLock());
    }

    return lockByPath.get(filepath);
  };

  const send = (msg: FSEvent, socket: WebSocket) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg));
    }
  };

  const broadcast = (msg: FSEvent) => {
    const msgStr = JSON.stringify(msg);
    for (const socket of sockets) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(msgStr);
      }
    }
  };

  const watchFS = async () => {
    const watcher = Deno.watchFs(cwd, { recursive: true });

    for await (const { kind, paths } of watcher) {
      if (kind !== "create" && kind !== "remove" && kind !== "modify") {
        continue;
      }

      const [filepath] = paths;

      if (shouldIgnore(filepath)) {
        continue;
      }

      const [status, metadata, stats] = await Promise.all([
        git.status(),
        inferMetadata(filepath),
        stat(filepath),
      ]);

      broadcast({
        type: "sync",
        detail: {
          status,
          metadata,
          timestamp: stats.mtime?.getTime() ?? Date.now(),
          filepath: browserPathFromSystem(filepath),
        },
      });
    }
  };

  app.use(lockerGitAPI.rlock);

  app.get("/watch", (c) => {
    const since = Number(c.req.query("since"));

    if (c.req.header("Upgrade") !== "websocket") {
      return new Response("Missing header Upgrade: websocket ", {
        status: 400,
      });
    }

    const { response, socket } = Deno.upgradeWebSocket(c.req.raw);

    socket.addEventListener(
      "close",
      () => {
        const index = sockets.findIndex((s) => s === socket);
        console.log(
          colors.bold(`[admin.deco.cx][${index}]:`),
          "socket is",
          colors.red("closed"),
        );

        if (index > -1) {
          sockets.splice(index, 1);
        }
      },
    );

    socket.addEventListener("open", async () => {
      const index = sockets.findIndex((s) => s === socket);
      console.log(
        colors.bold(`[admin.deco.cx][${index}]:`),
        "socket is",
        colors.green("open"),
      );

      const walker = walk(cwd, { includeDirs: false, includeFiles: true });

      for await (const entry of walker) {
        if (shouldIgnore(entry.path)) {
          continue;
        }

        const [metadata, stats] = await Promise.all([
          inferMetadata(entry.path),
          stat(entry.path),
        ]);

        const mtime = stats.mtime?.getTime() ?? Date.now();

        if (
          !metadata || mtime < since
        ) {
          continue;
        }

        const filepath = browserPathFromSystem(entry.path);
        send({
          type: "sync",
          detail: { metadata, filepath, timestamp: mtime },
        }, socket);
      }

      if (socket.readyState !== WebSocket.OPEN) {
        return;
      }

      send({
        type: "snapshot",
        detail: { timestamp: Date.now(), status: await git.status() },
      }, socket);
    });

    sockets.push(socket);

    return response;
  });

  const systemPathFromBrowser = (url: string) => {
    const [_, ...segments] = url.split("/file");
    const s = segments.join("/file");

    return join(cwd, "/", s);
  };

  const browserPathFromSystem = (filepath: string) =>
    filepath.replace(cwd, "").replaceAll(SEPARATOR, "/");

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
    const { patch, hash } = await c.req.json<PatchAPI["body"]>();
    using _ = await getRwLock(filepath)?.wlock();

    const content = await Deno.readTextFile(filepath).catch((e) => {
      if (e instanceof Deno.errors.NotFound) {
        return null;
      }
      throw e;
    });

    const result = applyPatch(content, patch);

    if (!result.conflict) {
      await ensureFile(filepath);
      await Deno.writeTextFile(filepath, result.content);
    }

    const [status, metadata, stats] = await Promise.all([
      git.status(),
      inferMetadata(filepath),
      Deno.stat(filepath),
    ]);

    const timestamp = stats.mtime?.getTime() ?? Date.now();

    const update: UpdateResponse = result.conflict
      ? { conflict: true, status, metadata, timestamp, content }
      : {
        conflict: false,
        status,
        metadata,
        timestamp,
        content: hash !== await sha1(result.content)
          ? result.content
          : undefined,
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

  watchFS().catch(console.error);

  return app;
};
