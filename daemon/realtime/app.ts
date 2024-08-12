import { Hono, type MiddlewareHandler } from "@hono/hono";
import * as colors from "@std/fmt/colors";
import { ensureFile } from "@std/fs";
import { walk, WalkError } from "@std/fs/walk";
import { join, SEPARATOR } from "@std/path";
import fjp from "fast-json-patch";
import { BinaryIndexedTree } from "./crdt/bit.ts";
import { apply } from "./crdt/text.ts";
import {
  type FilePatchResult,
  isJSONFilePatch,
  isTextFileSet,
  type VolumePatchRequest,
  type VolumePatchResponse,
} from "./types.ts";

interface Session {
  socket: WebSocket;
}

interface BroadcastMessage {
  path: string;
  timestamp: number;
  deleted?: boolean;
  messageId?: string;
}

// Allow one single request at a time
const inflight = (): MiddlewareHandler => {
  let promise = Promise.resolve();

  return async (_c, next) => {
    promise = promise.catch(() => {}).then(next);

    await promise;
  };
};

const toPosix = (path: string) => path.replaceAll(SEPARATOR, "/");

const ignoreNotFound = (e: Error) => {
  if (e instanceof Deno.errors.NotFound) {
    return null;
  }

  throw e;
};

export const createRealtimeAPIs = () => {
  const app = new Hono({ strict: true });
  const cwd = Deno.cwd();

  const sessions: Session[] = [];
  const textState = new Map<number, BinaryIndexedTree>();

  let timestamp = Date.now();

  const broadcast = (msg: BroadcastMessage) =>
    sessions.forEach((session) => session.socket.send(JSON.stringify(msg)));

  const broadcastFS = async () => {
    const watcher = Deno.watchFs(cwd, { recursive: true });

    for await (const { kind, paths } of watcher) {
      if (kind !== "create" && kind !== "remove" && kind !== "modify") {
        continue;
      }

      const path = paths[0];

      if (path.includes(".git")) {
        continue;
      }

      broadcast({
        path: toPosix(path).replace(cwd, ""),
        timestamp: Date.now(),
        deleted: kind === "remove",
      });
    }
  };

  app.use(inflight());
  app.get("/", (c) => {
    if (c.req.header("Upgrade") !== "websocket") {
      return new Response("Missing header Upgrade: websocket ", {
        status: 400,
      });
    }

    const { response, socket } = Deno.upgradeWebSocket(c.req.raw);

    socket.addEventListener(
      "close",
      () => {
        console.log(
          colors.bold("[deco.cx]:"),
          "admin websocket is",
          colors.red("closed"),
        );
        const index = sessions.findIndex((s) => s.socket === socket);
        if (index > -1) {
          sessions.splice(index, 1);
        }
      },
    );

    socket.addEventListener(
      "open",
      () =>
        console.log(
          colors.bold("[deco.cx]:"),
          "admin websocket is",
          colors.green("open"),
        ),
    );

    sessions.push({ socket });

    return response;
  });
  app.patch("/", async (c) => {
    const { patches } = await c.req.json() as VolumePatchRequest;

    const results: FilePatchResult[] = [];

    for (const patch of patches) {
      if (isJSONFilePatch(patch)) {
        const { path, patches: operations } = patch;

        const content = await Deno.readTextFile(join(cwd, path))
          .catch(ignoreNotFound) ?? "{}";

        try {
          const newContent = JSON.stringify(
            operations.reduce(fjp.applyReducer, JSON.parse(content)),
          );

          results.push({
            accepted: true,
            path,
            content: newContent,
            deleted: newContent === "null",
          });
        } catch (error) {
          console.error(error);
          results.push({ accepted: false, path, content });
        }
      } else if (isTextFileSet(patch)) {
        const { path, content } = patch;
        try {
          const p = join(cwd, path);
          await ensureFile(p);
          await Deno.writeTextFile(p, content ?? "");
          results.push({
            accepted: true,
            path,
            content: content ?? "",
            deleted: content === null,
          });
        } catch {
          results.push({ accepted: false, path, content: content ?? "" });
        }
      } else {
        const { path, operations, timestamp } = patch;
        const content = await Deno.readTextFile(join(cwd, path))
          .catch(ignoreNotFound) ?? "";
        if (!textState.has(timestamp)) { // durable was restarted
          results.push({ accepted: false, path, content });
          continue;
        }
        const bit = textState.get(timestamp) ??
          new BinaryIndexedTree();
        const [result, success] = apply(content, operations, bit);
        if (success) {
          textState.set(timestamp, bit);
          results.push({
            accepted: true,
            path,
            content: result,
          });
        } else {
          results.push({
            accepted: false,
            path,
            content,
          });
        }
      }
    }

    timestamp = Date.now();
    textState.set(timestamp, new BinaryIndexedTree());
    const shouldWrite = results.every((r) => r.accepted);

    if (shouldWrite) {
      await Promise.all(
        results.map(async (r) => {
          try {
            const system = join(cwd, r.path);
            if (r.deleted) {
              await Deno.remove(system);
            } else {
              await ensureFile(system);
              await Deno.writeTextFile(system, r.content!);
            }
          } catch (error) {
            console.error(error);
            r.accepted = false;
          }
        }),
      );
    }

    return Response.json(
      {
        timestamp,
        results,
      } satisfies VolumePatchResponse,
    );
  });
  app.get("/*", async (c) => {
    const [_, ...segments] = c.req.path.split("/files");
    const path = segments.join("/");
    const withContent = c.req.query("content") === "true";

    const fs: Record<string, { content: string | null }> = {};
    const root = join(cwd, path);

    try {
      const walker = walk(root, {
        includeDirs: false,
        includeFiles: true,
        includeSymlinks: false,
      });

      for await (const entry of walker) {
        const key = toPosix(entry.path.replace(root, "/"));

        if (key.includes(".git")) {
          continue;
        }

        fs[key] = {
          content: withContent
            ? await Deno.readTextFile(entry.path).catch(ignoreNotFound)
            : null,
        };
      }
    } catch (error) {
      if (!(error instanceof WalkError)) {
        throw error;
      }

      fs[toPosix(path)] = {
        content: withContent
          ? await Deno.readTextFile(root).catch(ignoreNotFound)
          : null,
      };
    }

    return Response.json({ timestamp, fs });
  });

  broadcastFS();

  return app;
};
