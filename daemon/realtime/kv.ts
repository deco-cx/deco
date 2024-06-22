import type { FSApi } from "deco/daemon/realtime/object.ts";
import { Queue } from "https://deno.land/x/async@v2.1.0/queue.ts";

export class KvFs implements FSApi {
  private base: string;
  private broadcastChannel: BroadcastChannel;
  private events: Queue<Deno.FsEvent> = new Queue();
  private kv: Promise<Deno.Kv>;

  constructor(base: string) {
    this.base = base;
    this.kv = Deno.openKv();
    this.broadcastChannel = new BroadcastChannel(`kv_realtime_storage_${base}`);
    this.broadcastChannel.onmessage = (event) => {
      this.events.push(event.data);
    };
  }

  private getFullPath(path: string | URL): string[] {
    return [this.base, path.toString()];
  }

  async ensureDir(_path: string | URL): Promise<void> {}
  async exists(path: string): Promise<boolean> {
    return (await this.kv).get(this.getFullPath(path)).then((v) =>
      v.value !== null
    );
  }

  async *readDir(path: string | URL): AsyncIterable<Deno.DirEntry> {
    const list = (await this.kv).list({ prefix: this.getFullPath(path) });
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
      await (await this.kv).delete([...fullPath, entry.name]);
      this.broadcastChannel.postMessage({
        path: fullPath,
        type: "remove",
      });
    }
  }

  async writeTextFile(path: string | URL, data: string): Promise<void> {
    const fullPath = this.getFullPath(path);
    await (await this.kv).set(fullPath, data);
    this.broadcastChannel.postMessage({
      path: fullPath,
      type: "modify",
    });
  }

  async readTextFile(path: string | URL): Promise<string> {
    const result = await (await this.kv).get<string>(this.getFullPath(path));
    if (result.value !== null) {
      return result.value;
    } else {
      throw new Deno.errors.NotFound(`file not found ${path}`);
    }
  }

  async *watchFs(_paths: string | string[]): AsyncIterable<Deno.FsEvent> {
    while (true) {
      yield await this.events.pop();
    }
  }
}
