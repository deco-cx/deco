import {
  ensureFile,
  fjp,
  Hono,
  join,
  POSIX_SEPARATOR,
  Realtime,
  SEPARATOR,
  walk,
  WalkError,
} from "../deps.ts";
import { BinaryIndexedTree } from "./crdt/bit.ts";
import { apply } from "./crdt/text.ts";

interface Session {
  socket: WebSocket;
}

// Allow one single request at a time
const inflight = (): Hono.MiddlewareHandler => {
  let promise = Promise.resolve();

  return async (_c, next) => {
    promise = promise.catch(() => {}).then(next);

    await promise;
  };
};

const toPosix = (path: string) => path.replaceAll(SEPARATOR, POSIX_SEPARATOR);

const ignoreNotFound = (e: Error) => {
  if (e instanceof Deno.errors.NotFound) {
    return null;
  }

  throw e;
};

export const createRealtimeAPIs = () => {
  const app = new Hono.Hono({ strict: true });
  const cwd = Deno.cwd();

  const sessions: Session[] = [];
  const textState = new Map<number, BinaryIndexedTree>();

  let timestamp = Date.now();

  const broadcast = (msg: {
    path: string;
    timestamp: number;
    deleted?: boolean;
    messageId?: string;
  }) => {
    console.log("Broadcasting", msg.path, sessions.length);
    sessions.forEach((session) => session.socket.send(JSON.stringify(msg)));
  };

  const broadcastFS = async () => {
    const watcher = Deno.watchFs(cwd, { recursive: true });

    for await (const { kind, paths, flag } of watcher) {
      if (kind === "create" || kind === "remove" || kind === "modify") {
        const path = paths[0];

        if (path.includes(".git")) {
          continue;
        }

        broadcast({
          path: toPosix(path).replace(cwd, ""),
          timestamp: Date.now(),
          deleted: kind === "remove",
        });
      } else {
        console.log("unknown event", { kind, paths, flag });
      }
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
        console.log("Socket closed by admin");
        const index = sessions.findIndex((s) => s.socket === socket);
        if (index > -1) {
          sessions.splice(index, 1);
        }
      },
    );

    sessions.push({ socket });

    return response;
  });
  app.patch("/", async (c) => {
    const { patches } = await c.req
      .json() as Realtime.VolumePatchRequest;

    const results: Realtime.FilePatchResult[] = [];

    for (const patch of patches) {
      if (Realtime.isJSONFilePatch(patch)) {
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
          console.error(error, fjp);
          results.push({ accepted: false, path, content });
        }
      } else if (Realtime.isTextFileSet(patch)) {
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
      } satisfies Realtime.VolumePatchResponse,
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
