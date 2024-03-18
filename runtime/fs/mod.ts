import { Context } from "../../deco.ts";
import { FileSystem } from "../../scripts/mount.ts";

export interface IVFS {
  readFile: typeof Deno.readFile;
  cwd: typeof Deno.cwd;
  watchFs: typeof Deno.watchFs;
  writeFile: typeof Deno.writeFile;
  mkdir: typeof Deno.mkdir;
  readDir: typeof Deno.readDir;
}

const base: IVFS = {
  readFile: Deno.readFile,
  cwd: Deno.cwd,
  watchFs: Deno.watchFs,
  writeFile: Deno.writeFile,
  mkdir: Deno.mkdir,
  readDir: Deno.readDir,
};

for (const [func, impl] of Object.entries(base)) {
  const funcKey = func as keyof typeof base;
  // @ts-ignore: trust-me
  Deno[funcKey] = (...args) => {
    const fs = Context.active().fs;
    // @ts-ignore: trust-me
    return fs?.[func]?.(...args) ?? impl(...args);
  };
}

const textEncoder = new TextEncoder();
type WatcherMap = Record<string, Array<() => void>>;

export class VFS implements IVFS {
  protected watchers: WatcherMap = {};
  constructor(protected fileSystem: FileSystem) {}
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
    return Promise.resolve();
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
    const pathsArray = Array.isArray(paths) ? paths : [paths];
    const watchers = this.watchers;

    const { promise: closedPromise, resolve: resolveClosePromise } = Promise
      .withResolvers<void>();

    const generator = function () {
      const subscribe = (path: string) => {
        if (!watchers[path]) {
          watchers[path] = [];
        }
        return new Promise<string>((resolve) => {
          watchers[path].push(() => resolve(path));
        });
      };

      const inner = async function* () {
        while (true) {
          const triggeredPath: string | void = await Promise.race([
            Promise.any(pathsArray.map(subscribe)),
            closedPromise,
          ]);

          // If closed, return
          if (typeof triggeredPath !== "string") {
            return;
          }

          // Yield the event for the triggered path
          yield { path: triggeredPath, kind: "modify" };
        }
      };

      return {
        ...inner(),
        close: () => {
          resolveClosePromise();
        },
        [Symbol.dispose]() {
          resolveClosePromise();
        },
        rid: (Math.random() * 100) + 1,
      };
    };

    const fsWatcher = generator() as Deno.FsWatcher;
    return fsWatcher;
  }
  cwd(): string {
    return "/";
  }
  readFile(
    path: string | URL,
    _options?: Deno.ReadFileOptions | undefined,
  ): Promise<Uint8Array> {
    const file = this.fileSystem[path.toString()];
    if (!file || file.content === null) {
      throw new Deno.errors.NotFound(`File not found: ${path}`);
    }
    return Promise.resolve(textEncoder.encode(file.content));
  }
}
