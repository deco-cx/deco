import { Queue } from "https://deno.land/x/async@v2.1.0/queue.ts";
import { DENO_FS_APIS } from "../daemon.ts";
import { DaemonDiskStorage, type FileSystemApi } from "./object.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const CHUNKSIZE = 65536;
const DENO_CWD = Deno.cwd();
export class KvFs implements FileSystemApi {
  private broadcastChannel: BroadcastChannel;
  private durableFS: DaemonDiskStorage = new DaemonDiskStorage({
    fsApi: DENO_FS_APIS,
    dir: DENO_CWD,
  });
  private events: Queue<Deno.FsEvent> = new Queue();

  private constructor(protected base: string, private kv: Deno.Kv) {
    this.broadcastChannel = new BroadcastChannel(`kv_realtime_storage_${base}`);
    this.broadcastChannel.onmessage = (event) => {
      this.events.push(event.data);
    };
  }

  private async initialize() {
    const paths = await this.durableFS.list<string>();

    const writes: Promise<void>[] = [];
    for (const [key, value] of paths.entries()) {
      if (!value) {
        continue;
      }

      writes.push(this.writeTextFile(key, value));
    }
    await Promise.all(writes);
  }

  public static async New(base: string): Promise<KvFs> {
    const kv = await Deno.openKv();
    const kvFs = new KvFs(base, kv);
    await kvFs.initialize();
    return kvFs;
  }

  private getFullPath(path: string | URL): string[] {
    return [this.base, path.toString().replace(DENO_CWD, "")];
  }

  async ensureDir(_path: string | URL): Promise<void> {}
  exists(path: string): Promise<boolean> {
    return this.kv.get(this.getFullPath(path)).then((v) => v.value !== null);
  }

  async *readDir(path: string | URL): AsyncIterable<Deno.DirEntry> {
    const list = this.kv.list({ prefix: this.getFullPath(path) });
    for await (const entry of list) {
      yield {
        name: entry.key.join().replace(this.getFullPath(path).join(), ""),
        isDirectory: false,
        isFile: true,
        isSymlink: false,
      };
    }
  }

  async remove(
    path: string | URL,
    _options?: { recursive: boolean } | undefined,
  ): Promise<void> {
    const fullPath = this.getFullPath(path);

    for await (const entry of this.readDir(path)) {
      await this.kv.delete([...fullPath, entry.name]);
      this.broadcastChannel.postMessage({
        path: fullPath,
        type: "remove",
      });
    }
  }

  async writeTextFile(path: string | URL, data: string): Promise<void> {
    const filepath = this.getFullPath(path);
    const metadata = await this.kv.get(filepath);
    const content = encoder.encode(data);

    let transaction = this.kv.atomic();
    let chunks = 0;
    for (; chunks * CHUNKSIZE < content.length; chunks++) {
      transaction = transaction.set(
        [...filepath, chunks],
        content.slice(chunks * CHUNKSIZE, (chunks + 1) * CHUNKSIZE),
      );
    }
    const result = await transaction
      .set(filepath, chunks)
      .check(metadata)
      .commit();
    if (!result.ok) {
      throw new Error(`could not write ${path}`);
    }
    this.broadcastChannel.postMessage({
      path: filepath,
      type: "modify",
    });
  }

  async readTextFile(path: string | URL): Promise<string> {
    const filepath = this.getFullPath(path);
    const metadata = await this.kv.get(filepath).catch(() => null);

    if (metadata?.versionstamp == null) {
      throw new Deno.errors.NotFound(`file not found ${path}`);
    }

    const chunks: Uint8Array[] = [];

    // Should print an array with length 90788 (5x 16384 + 8868 your source arrays)
    for await (const chunk of this.kv.list<Uint8Array>({ prefix: filepath })) {
      chunks.push(chunk.value);
    }
    // Get the total length of all arrays.
    let length = 0;
    chunks.forEach((item) => {
      length += item.length;
    });

    // Create a new array with total length and merge all source arrays.
    const mergedArray = new Uint8Array(length);
    let offset = 0;
    chunks.forEach((item) => {
      mergedArray.set(item, offset);
      offset += item.length;
    });
    return decoder.decode(mergedArray);
  }

  async *watchFs(_paths: string | string[]): AsyncIterable<Deno.FsEvent> {
    while (true) {
      yield await this.events.pop();
    }
  }
}
