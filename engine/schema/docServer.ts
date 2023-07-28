import { context } from "$live/live.ts";
import { DocNode } from "https://deno.land/x/deno_doc@0.59.0/lib/types.d.ts";
import {
  asChannel,
  Channel,
} from "https://denopkg.com/deco-cx/denodoc@3a5c9aa8c1aef4b602e943ddbbced5b58b870cf6/channel.ts";
import type {
  BeginDenoDocRequest,
  DocRequest,
  DocResponse,
  FileContentRequest,
  FileContentResponse,
} from "https://denopkg.com/deco-cx/denodoc@3a5c9aa8c1aef4b602e943ddbbced5b58b870cf6/main.ts";
import { Deferred, deferred } from "std/async/deferred.ts";
import { fromFileUrl, join, toFileUrl } from "std/path/mod.ts";
const serverUrl = "wss://denodoc-server.fly.dev/ws"; //"ws://localhost:8081/ws";

type DenoDocChannel = Channel<
  BeginDenoDocRequest | DocRequest | FileContentResponse,
  DocResponse | FileContentRequest
>;

export let channel: Promise<DenoDocChannel> | null = null;
export const newChannel = (): Promise<
  DenoDocChannel
> => {
  channel ??= asChannel((() => {
    const socket = new WebSocket(serverUrl);
    socket.binaryType = "arraybuffer";
    return socket;
  })());
  return channel;
};

const isDocResponse = (v: unknown | DocResponse): v is DocResponse => {
  return (v as DocResponse).docNodes !== undefined;
};

export type DocFunction = (path: string) => Promise<DocNode[]>;
let denoDoc: Promise<DocFunction> | null = null;

export const getDenoDoc = (): Promise<DocFunction> => {
  if (denoDoc) {
    return denoDoc;
  }
  return denoDoc ??= newChannel().then((c) => denoDocForChannel(c));
};
const denoDocForChannel = async (c: DenoDocChannel): Promise<DocFunction> => {
  const importMap = await Deno.readTextFile(
    join(Deno.cwd(), "import_map.json"),
  );
  if (c.closed.is_set()) {
    throw new Error("channel was closed");
  }
  c.send({
    importMap,
    deploymentId: context.deploymentId! ?? btoa(Deno.hostname()),
    cwd: toFileUrl(Deno.cwd()).toString(),
  });
  const resolved: Record<string, Deferred<DocNode[]>> = {};
  const pendings: Record<string, boolean> = {};
  (async () => {
    try {
      while (!c.closed.is_set()) {
        console.log("waiting");
        const closed = await Promise.race([c.closed.wait(), c.recv()]);
        console.log("recv");
        if (closed === true) {
          break;
        }
        if (isDocResponse(closed)) {
          resolved[closed.path] ??= deferred<DocNode[]>();
          try {
            resolved[closed.path].resolve(JSON.parse(closed.docNodes));
          } catch (err) {
            console.log("ERR", err);
            resolved[closed.path].resolve([]);
          }
        } else if (!c.closed.is_set()) {
          c.send({
            path: closed.path,
            content: await Deno.readTextFile(
              fromFileUrl(toFileUrl(join(Deno.cwd(), closed.path)).toString()),
            ),
          });
        }
      }
    } catch (err) {
      console.log("loop err", err);
    }
  })();
  return (path: string): Promise<DocNode[]> => {
    if (!c.closed.is_set()) {
      if (resolved[path] !== undefined) {
        return resolved[path];
      }
      resolved[path] ??= deferred<DocNode[]>();
      pendings[path] = true;
      c.send({ path });
      return resolved[path].finally(() => {
        delete pendings[path];
        console.log(Object.keys(pendings));
      });
    }
    return Promise.resolve([]);
  };
};
