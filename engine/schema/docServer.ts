import { DocNode } from "https://deno.land/x/deno_doc@0.59.0/lib/types.d.ts";
import {
  asChannel,
  Channel,
} from "https://denopkg.com/deco-cx/denodoc@9c2ddd8cce33261745f376eb2d32f05273b91a74/channel.ts";
import type {
  BeginDenoDocRequest,
  DocRequest,
  DocResponse,
} from "https://denopkg.com/deco-cx/denodoc@9c2ddd8cce33261745f376eb2d32f05273b91a74/main.ts";
import { Deferred, deferred } from "std/async/deferred.ts";
import { crypto, toHashString } from "std/crypto/mod.ts";
import { fromFileUrl, join, toFileUrl } from "std/path/mod.ts";
const serverUrl =  "wss://denodoc-go.fly.dev/ws"; // "ws://localhost:8080/ws"; 

interface DocResponseChal extends DocResponse {
  chal?: boolean;
}
type DenoDocChannel = Channel<
  BeginDenoDocRequest | DocRequest,
  DocResponseChal
>;

export let channel: Promise<DenoDocChannel> | null = null;

const createChannel = () => {
  return asChannel<BeginDenoDocRequest | DocRequest, DocResponse>((() => {
    const socket = new WebSocket(serverUrl);
    socket.binaryType = "arraybuffer";
    return socket;
  })());
};
export const newChannel = (): Promise<
  DenoDocChannel
> => {
  if (channel === null) {
    return channel ??= createChannel();
  }
  return channel.then((c) => {
    if (c.closed.is_set()) {
      return channel = createChannel();
    }
    return c;
  });
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
    cwd: toFileUrl(Deno.cwd()).toString(),
  });
  const resolved: Record<string, Deferred<DocNode[]>> = {};
  const fileRead: Record<string, Promise<string>> = {};
  const hashes: Record<string, Promise<string>> = {};
  const send = sendFor(fileRead, hashes, c, resolved);

  (async () => {
    try {
      while (!c.closed.is_set()) {
        const closed = await Promise.race([c.closed.wait(), c.recv()]);
        if (closed === true) {
          break;
        }
        if (closed.chal) {
          const fullURL = toFileUrl(join(Deno.cwd(), closed.path)).toString();
          if (resolved[fullURL] !== undefined) {
            continue;
          }
          resolved[fullURL] ??= deferred<DocNode[]>();
          send(fullURL, true);
          continue;
        }
        try {
          resolved[closed.path].resolve(JSON.parse(closed.docNodes));
        } catch (err) {
          console.log("should not reach here", err);
          resolved[closed.path].resolve([]);
        }
      }
    } catch (err) {
      console.log("loop err", err);
    }
  })();
  return async (path: string): Promise<DocNode[]> => {
    if (!c.closed.is_set()) {
      if (resolved[path] !== undefined) {
        return resolved[path];
      }
      resolved[path] ??= deferred<DocNode[]>();
      if (!path.startsWith("file://")) {
        c.send({ path });
        return resolved[path];
      }
      return await send(path);
    }
    return Promise.resolve([]);
  };
};

const sendFor = (
  fileRead: Record<string, Promise<string>>,
  hashes: Record<string, Promise<string>>,
  c: DenoDocChannel,
  resolved: Record<string, Deferred<DocNode[]>>,
) =>
async (
  path: string,
  chal = false,
) => {
  fileRead[path] ??= Deno.readTextFile(fromFileUrl(path));
  hashes[path] ??= fileRead[path].then(async (str) => {
    const hash = await crypto.subtle.digest(
      "MD5",
      new TextEncoder().encode(str),
    );
    return toHashString(hash);
  });

  const [content, hash] = await Promise.all([fileRead[path], hashes[path]]);
  c.send({ path, content, hash });
  return resolved[path];
};
