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
const fromPosix = (path: string) => path.replaceAll(POSIX_SEPARATOR, SEPARATOR);

const ignoreNotFound = (e: Error) => {
  if (e instanceof Deno.errors.NotFound) {
    return null;
  }

  throw e;
};

export const createRealtimeApp = () => {
  const app = new Hono.Hono({ strict: true });

  const sessions: Session[] = [];
  const textState = new Map<number, BinaryIndexedTree>();

  let timestamp = Date.now();

  const broadcast = (msg: unknown) =>
    sessions.forEach((session) => session.socket.send(JSON.stringify(msg)));

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
      (cls) => {
        const index = sessions.findIndex((s) => s.socket === socket);
        index > -1 && sessions.splice(index, 1);

        socket.close(cls.code, "Daemon is closing WebSocket");
      },
    );

    return response;
  });
  app.patch("/", async (c) => {
    const { patches, messageId } = await c.req
      .json() as Realtime.VolumePatchRequest;

    const results: Realtime.FilePatchResult[] = [];

    for (const patch of patches) {
      if (Realtime.isJSONFilePatch(patch)) {
        const { path, patches: operations } = patch;
        const content = await Deno.readTextFile(fromPosix(path))
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
        } catch {
          results.push({ accepted: false, path, content });
        }
      } else if (Realtime.isTextFileSet(patch)) {
        const { path, content } = patch;
        try {
          await ensureFile(fromPosix(path));
          await Deno.writeTextFile(path, content ?? "");
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
        const content = await Deno.readTextFile(fromPosix(path))
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
            const system = fromPosix(r.path);
            if (r.deleted) {
              await Deno.remove(system);
            } else {
              await Deno.writeTextFile(system, r.content!);
            }
          } catch (error) {
            console.error(error);
            r.accepted = false;
          }
        }),
      );

      const shouldBroadcast = results.every((r) => r.accepted);
      if (shouldBroadcast) {
        for (const result of results) {
          const { path, deleted } = result;
          broadcast({
            messageId,
            path,
            timestamp,
            deleted,
          });
        }
      }
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
    const root = join(Deno.cwd(), path);

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

  return app;
};
