import { Queue } from "https://deno.land/x/async@v2.1.0/queue.ts";
import { Context } from "../../deco.ts";
import { FileSystem } from "../../scripts/mount.ts";
import { fileSeparatorToSlash } from "../../utils/filesystem.ts";


export interface IVFS {
  readFile: typeof Deno.readFile;
  watchFs: typeof Deno.watchFs;
  writeFile: typeof Deno.writeFile;
  mkdir: typeof Deno.mkdir;
  readDir: typeof Deno.readDir;
  remove: typeof Deno.remove;
  writeTextFile: typeof Deno.writeTextFile;
  readTextFile: typeof Deno.readTextFile;
  lastWrite: number;
}

export const DenoFs: IVFS = {
  lastWrite: Date.now(),
  readFile: Deno.readFile,
  watchFs: Deno.watchFs,
  writeFile: Deno.writeFile,
  mkdir: Deno.mkdir,
  readDir: Deno.readDir,
  remove: Deno.remove,
  writeTextFile: Deno.writeTextFile,
  readTextFile: Deno.readTextFile,
};

for (const [func, impl] of Object.entries(DenoFs)) {
  const funcKey = func as keyof typeof DenoFs;
  // @ts-ignore: trust-me
  Deno[funcKey] = (...args) => {
    const fs = Context.active().fs;
    // @ts-ignore: trust-me
    const fsMk = fs?.[funcKey]?.bind(fs);
    if (typeof fsMk !== "function") {
      return impl(...args);
    }
    const [arg0, ...rest] = args ?? []; // always should be path
    if (arg0 instanceof URL || typeof arg0 === "string") {
      const path = arg0.toString();
      if (path.startsWith(Deno.cwd())) {
        // @ts-ignore: trust-me
        return fsMk(...[fileSeparatorToSlash(path.replace(Deno.cwd(), "")), ...rest]);
      }
      return impl(...args);
    }
    // @ts-ignore: trust-me
    return fsMk(...args);
  };
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
type WatcherMap = Record<string, Record<string, Queue<string>>>;

export class VFS implements IVFS {
  protected watchers: WatcherMap = {};
  public lastWrite = Date.now();
  constructor(public fileSystem: FileSystem) {}
  writeTextFile(
    path: string | URL,
    data: string | ReadableStream<string>,
    options?: Deno.WriteFileOptions | undefined,
  ): Promise<void> {
    // Convert text data to Uint8Array
    const encoder = new TextEncoder();
    const encodedData = typeof data === "string" ? encoder.encode(data) : null;
    if (!encodedData) {
      return Promise.resolve();
    }

    // Call writeFile with converted data
    return this.writeFile(path, encodedData, options);
  }
  remove(
    path: string | URL,
    _options?: Deno.RemoveOptions | undefined,
  ): Promise<void> {
    const filePath = path.toString();
    delete this.fileSystem[filePath];
    this.notifyForPath(filePath);
    return Promise.resolve();
  }
  readDir(path: string | URL): AsyncIterable<Deno.DirEntry> {
    const entries: Deno.DirEntry[] = [];
    const directoryPath = path.toString();

    for (const [filePath] of Object.keys(this.fileSystem)) {
      if (filePath.startsWith(directoryPath) && filePath !== directoryPath) {
        const relativePath = filePath.slice(directoryPath.length + 1);
        const parts = relativePath.split("/");
        const name = parts[0];
        const isFile = parts.length === 1;

        const dirEntry: Deno.DirEntry = {
          name,
          isFile: isFile,
          isDirectory: !isFile,
          isSymlink: false, // Not considering symlinks in this example
        };

        entries.push(dirEntry);
      }
    }

    return {
      [Symbol.asyncIterator](): AsyncIterator<Deno.DirEntry> {
        let index = 0;
        return {
          // deno-lint-ignore require-await
          async next(): Promise<IteratorResult<Deno.DirEntry>> {
            if (index < entries.length) {
              return { value: entries[index++], done: false };
            } else {
              return { value: undefined, done: true };
            }
          },
        };
      },
    };
  }
  writeFile(
    path: string | URL,
    data: Uint8Array | ReadableStream<Uint8Array>,
    __options?: Deno.WriteFileOptions | undefined,
  ): Promise<void> {
    const filePath = path.toString();
    const content = data instanceof Uint8Array
      ? new TextDecoder().decode(data)
      : null;
    this.fileSystem[filePath] = { content };
    this.notifyForPath(filePath);
    return Promise.resolve();
  }

  private notifyForPath(filePath: string) {
    for (const [prefix, watchers] of Object.entries(this.watchers)) {
      if (filePath.startsWith(prefix)) {
        Object.values(watchers).forEach((watcher) => watcher.push(filePath));
      }
    }
  }

  mkdir(
    _path: string | URL,
    _options?: Deno.MkdirOptions | undefined,
  ): Promise<void> {
    return Promise.resolve();
  }

  watchFs(
    paths: string | string[],
    _options?: { recursive: boolean },
  ): Deno.FsWatcher {
    const subscriptionId = crypto.randomUUID();
    const pathsArray = Array.isArray(paths) ? paths : [paths];
    const watchers = this.watchers;
    const q = new Queue<string>();

    pathsArray.forEach((path) => {
      watchers[path] ??= {};
      watchers[path][subscriptionId] = q;
    });

    const { promise: closedPromise, resolve: resolveClosePromise } = Promise
      .withResolvers<void>();

    const generator = function () {
      const inner = async function* () {
        const ctrl = new AbortController();
        closedPromise.finally(() => ctrl.abort());
        while (true) {
          const paths = [];
          do {
            const triggeredPath: string | void = await Promise.race([
              q.pop({ signal: ctrl.signal }),
              closedPromise,
            ]);

            // If closed, return
            if (typeof triggeredPath !== "string") {
              return;
            }
            paths.push(triggeredPath);
          } while (q.size > 0);

          // Yield the event for the triggered path
          yield { paths, kind: "modify" as const };
        }
      };

      const iterator: Partial<Deno.FsWatcher> = inner();
      const dispose = () => {
        resolveClosePromise();
        pathsArray.map((path) => {
          delete watchers[path][subscriptionId];
        });
      };
      iterator.close = dispose;
      iterator[Symbol.dispose] = dispose;
      // @ts-ignore: trust me
      iterator.rid = (Math.random() * 100) + 1;
      return iterator as Deno.FsWatcher;
    };

    const fsWatcher = generator();
    return fsWatcher;
  }

  readTextFile(
    path: string | URL,
    _options?: Deno.ReadFileOptions | undefined,
  ): Promise<string> {
    return this.readFile(path, _options).then((data) =>
      textDecoder.decode(data)
    );
  }
  readFile(
    path: string | URL,
    _options?: Deno.ReadFileOptions | undefined,
  ): Promise<Uint8Array> {
    const filePath = path.toString();
    const file = this.fileSystem[filePath];
    if (!file || file.content === null) {
      return DenoFs.readFile(path, _options);
      // TODO(mcandeia) create tiered fs throw new Deno.errors.NotFound(`File not found: ${path}`);
    }
    return Promise.resolve(textEncoder.encode(file.content));
  }
}
