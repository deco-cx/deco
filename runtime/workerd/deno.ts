// deno-lint-ignore-file no-explicit-any
/**
 * A minimal `Deno` namespace for running a deco site inside Cloudflare
 * Workers (workerd).
 *
 * workerd has no `Deno` global, no file system and no subprocesses. The deco
 * runtime, Fresh and their dependencies call `Deno.*` both at module
 * evaluation time (`Deno.env.get`, `Deno.cwd`) and while serving
 * (`Deno.readTextFile` on the decofile, `Deno.stat` on the Fresh snapshot).
 * This module installs a `globalThis.Deno` that:
 *
 * - reads env from the Worker bindings (string values only);
 * - serves a read-only, in-memory file system built at bundle time (the
 *   decofile blocks and the Fresh snapshot manifest); writes go to an
 *   ephemeral in-memory overlay that lives as long as the isolate;
 * - implements `upgradeWebSocket` on top of `WebSocketPair`;
 * - throws `Deno.errors.NotSupported` for everything that cannot exist on
 *   workerd (subprocesses, `Deno.serve`, KV, signals).
 *
 * Install it BEFORE the site modules are evaluated: bundle the site
 * separately and `import()` it after calling {@link installDenoShim}.
 */

export interface DenoShimOptions {
  /** Worker env bindings. Only string values are exposed via `Deno.env`. */
  env?: Record<string, unknown>;
  /**
   * Virtual file system: absolute POSIX paths to file contents. Directories
   * are derived from the paths. Add a path ending in `/` to declare an empty
   * directory.
   */
  files?: Record<string, string | Uint8Array>;
  /**
   * Files whose size is known up front but whose content is fetched on first
   * async read (`Deno.readFile`, `Deno.readTextFile`, `Deno.open`) through
   * `loadLazyFile`: absolute path to size in bytes. Used to expose the site's
   * static files, which live in Workers Static Assets, to Fresh. Sync reads of
   * these paths throw `NotSupported`.
   */
  lazyFiles?: Record<string, number>;
  /** Loads the content of a {@link DenoShimOptions.lazyFiles} entry. */
  loadLazyFile?: (path: string) => Promise<Uint8Array>;
  /** Value of `Deno.cwd()`. Defaults to `/app`. */
  cwd?: string;
  /** Value of `Deno.version.deno`. Defaults to `1.46.3`. */
  denoVersion?: string;
}

const ERROR_NAMES = [
  "NotFound",
  "PermissionDenied",
  "ConnectionRefused",
  "ConnectionReset",
  "ConnectionAborted",
  "NotConnected",
  "AddrInUse",
  "AddrNotAvailable",
  "BrokenPipe",
  "AlreadyExists",
  "InvalidData",
  "TimedOut",
  "Interrupted",
  "WriteZero",
  "WouldBlock",
  "UnexpectedEof",
  "BadResource",
  "Http",
  "Busy",
  "NotSupported",
  "FilesystemLoop",
  "IsADirectory",
  "NetworkUnreachable",
  "NotADirectory",
  "NotCapable",
] as const;

type ErrorCtor = new (message?: string) => Error;

const makeErrors = (): Record<(typeof ERROR_NAMES)[number], ErrorCtor> => {
  const errors = {} as Record<string, ErrorCtor>;
  for (const name of ERROR_NAMES) {
    errors[name] = class extends Error {
      constructor(message?: string) {
        super(message);
        this.name = name;
      }
    };
  }
  return errors as Record<(typeof ERROR_NAMES)[number], ErrorCtor>;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Like Deno: URLs are decoded, plain strings are taken literally. */
const toPath = (path: string | URL): string => {
  if (path instanceof URL) return decodeURIComponent(path.pathname);
  if (path.startsWith("file://")) {
    return decodeURIComponent(new URL(path).pathname);
  }
  return path;
};

/** Normalizes `a/./b/../c` and resolves relative paths against `cwd`. */
const normalize = (path: string, cwd: string): string => {
  const absolute = path.startsWith("/") ? path : `${cwd}/${path}`;
  const out: string[] = [];
  for (const part of absolute.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return `/${out.join("/")}`;
};

const dirname = (path: string) => {
  const idx = path.lastIndexOf("/");
  return idx <= 0 ? "/" : path.slice(0, idx);
};

interface FileInfo {
  isFile: boolean;
  isDirectory: boolean;
  isSymlink: boolean;
  size: number;
  mtime: Date | null;
  atime: Date | null;
  birthtime: Date | null;
  ctime: Date | null;
  dev: number;
  ino: number | null;
  mode: number | null;
  nlink: number | null;
  uid: number | null;
  gid: number | null;
  rdev: number | null;
  blksize: number | null;
  blocks: number | null;
  isBlockDevice: boolean | null;
  isCharDevice: boolean | null;
  isFifo: boolean | null;
  isSocket: boolean | null;
}

const fileInfo = (isDirectory: boolean, size: number): FileInfo => ({
  isFile: !isDirectory,
  isDirectory,
  isSymlink: false,
  size,
  mtime: null,
  atime: null,
  birthtime: null,
  ctime: null,
  dev: 0,
  ino: null,
  mode: null,
  nlink: null,
  uid: null,
  gid: null,
  rdev: null,
  blksize: null,
  blocks: null,
  isBlockDevice: false,
  isCharDevice: false,
  isFifo: false,
  isSocket: false,
});

class MemoryFs {
  files = new Map<string, Uint8Array | string>();
  /** Lazy files: path to size; content comes from a loader on async reads. */
  lazy = new Map<string, number>();
  dirs = new Set<string>(["/"]);

  constructor(private cwd: () => string) {}

  resolve(path: string | URL) {
    return normalize(toPath(path), this.cwd());
  }

  addDir(path: string) {
    let current = path;
    while (current !== "/" && !this.dirs.has(current)) {
      this.dirs.add(current);
      current = dirname(current);
    }
  }

  write(path: string, content: Uint8Array | string) {
    this.lazy.delete(path);
    this.files.set(path, content);
    this.addDir(dirname(path));
  }

  addLazy(path: string, size: number) {
    this.lazy.set(path, size);
    this.addDir(dirname(path));
  }

  bytes(path: string): Uint8Array {
    const content = this.files.get(path);
    if (content === undefined) return undefined as never;
    return typeof content === "string" ? encoder.encode(content) : content;
  }

  text(path: string): string {
    const content = this.files.get(path);
    if (content === undefined) return undefined as never;
    return typeof content === "string" ? content : decoder.decode(content);
  }

  stat(path: string): FileInfo | undefined {
    if (this.dirs.has(path)) return fileInfo(true, 0);
    const lazySize = this.lazy.get(path);
    if (lazySize !== undefined) return fileInfo(false, lazySize);
    const content = this.files.get(path);
    if (content === undefined) return undefined;
    return fileInfo(
      false,
      typeof content === "string"
        ? encoder.encode(content).byteLength
        : content.byteLength,
    );
  }

  list(path: string) {
    const prefix = path === "/" ? "/" : `${path}/`;
    const entries = new Map<string, boolean>();
    for (const file of [...this.files.keys(), ...this.lazy.keys()]) {
      if (!file.startsWith(prefix)) continue;
      const name = file.slice(prefix.length).split("/")[0];
      if (name && !entries.has(name)) {
        entries.set(name, this.dirs.has(`${prefix}${name}`));
      }
    }
    for (const dir of this.dirs) {
      if (!dir.startsWith(prefix)) continue;
      const name = dir.slice(prefix.length).split("/")[0];
      if (name) entries.set(name, true);
    }
    return [...entries].map(([name, isDirectory]) => ({
      name,
      isFile: !isDirectory,
      isDirectory,
      isSymlink: false,
    }));
  }

  remove(path: string, recursive = false) {
    if (this.files.delete(path) || this.lazy.delete(path)) return true;
    if (!this.dirs.has(path)) return false;
    const prefix = `${path}/`;
    const children = [...this.files.keys(), ...this.lazy.keys(), ...this.dirs]
      .filter((p) => p.startsWith(prefix));
    if (children.length && !recursive) return false;
    for (const child of children) {
      this.files.delete(child);
      this.lazy.delete(child);
      this.dirs.delete(child);
    }
    this.dirs.delete(path);
    return true;
  }
}

const notSupported = (errors: ReturnType<typeof makeErrors>, what: string) => {
  return (..._args: unknown[]): never => {
    throw new errors.NotSupported(`Deno.${what} is not supported on workerd`);
  };
};

/** Installs `globalThis.Deno`. Calling it again only refreshes env values. */
export function installDenoShim(opts: DenoShimOptions = {}): void {
  const g = globalThis as any;
  const existing = g.Deno?.__decoWorkerdShim as
    | { setEnv: (env: Record<string, unknown>) => void }
    | undefined;
  if (existing) {
    existing.setEnv(opts.env ?? {});
    return;
  }
  if (g.Deno !== undefined) {
    // Running on Deno: nothing to do.
    return;
  }

  const errors = makeErrors();
  let cwd = opts.cwd ?? "/app";
  const fs = new MemoryFs(() => cwd);
  fs.addDir(cwd);
  for (const [path, content] of Object.entries(opts.files ?? {})) {
    const normalized = normalize(path, cwd);
    if (path.endsWith("/")) fs.addDir(normalized);
    else fs.write(normalized, content);
  }
  if (opts.loadLazyFile) {
    for (const [path, size] of Object.entries(opts.lazyFiles ?? {})) {
      fs.addLazy(normalize(path, cwd), size);
    }
  }

  const envStore = new Map<string, string>();
  const setEnv = (env: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(env)) {
      if (typeof value === "string") envStore.set(key, value);
    }
  };
  const processEnv = g.process?.env;
  if (processEnv && typeof processEnv === "object") setEnv(processEnv);
  setEnv(opts.env ?? {});

  const notFound = (op: string, path: string) =>
    new errors.NotFound(
      `No such file or directory (os error 2): ${op} '${path}'`,
    );

  const stat = (path: string | URL) => {
    const resolved = fs.resolve(path);
    const info = fs.stat(resolved);
    if (!info) throw notFound("stat", resolved);
    return info;
  };
  const assertNotLazy = (resolved: string) => {
    if (fs.lazy.has(resolved)) {
      throw new errors.NotSupported(
        `'${resolved}' is loaded lazily: use the async Deno API`,
      );
    }
  };
  const loadLazy = async (resolved: string) => {
    const bytes = await opts.loadLazyFile!(resolved);
    if (!bytes) throw notFound("readfile", resolved);
    return bytes;
  };
  const readFileSync = (path: string | URL) => {
    const resolved = fs.resolve(path);
    assertNotLazy(resolved);
    if (fs.dirs.has(resolved)) {
      throw new errors.IsADirectory(`Is a directory: '${resolved}'`);
    }
    const bytes = fs.bytes(resolved);
    if (bytes === undefined) throw notFound("readfile", resolved);
    return bytes;
  };
  const readTextFileSync = (path: string | URL) => {
    const resolved = fs.resolve(path);
    assertNotLazy(resolved);
    const text = fs.text(resolved);
    if (text === undefined) throw notFound("readfile", resolved);
    return text;
  };
  const readDirSync = (path: string | URL) => {
    const resolved = fs.resolve(path);
    if (!fs.dirs.has(resolved)) throw notFound("readdir", resolved);
    return fs.list(resolved);
  };
  const mkdirSync = (
    path: string | URL,
    options?: { recursive?: boolean },
  ) => {
    const resolved = fs.resolve(path);
    if (fs.dirs.has(resolved) && !options?.recursive) {
      throw new errors.AlreadyExists(`File exists: '${resolved}'`);
    }
    fs.addDir(resolved);
  };
  const writeFileSync = (
    path: string | URL,
    data: Uint8Array | string,
    options?: { append?: boolean; createNew?: boolean },
  ) => {
    const resolved = fs.resolve(path);
    if (options?.createNew && fs.files.has(resolved)) {
      throw new errors.AlreadyExists(`File exists: '${resolved}'`);
    }
    if (options?.append && fs.files.has(resolved)) {
      const prev = fs.bytes(resolved);
      const next = typeof data === "string" ? encoder.encode(data) : data;
      const merged = new Uint8Array(prev.byteLength + next.byteLength);
      merged.set(prev, 0);
      merged.set(next, prev.byteLength);
      fs.write(resolved, merged);
      return;
    }
    fs.write(resolved, data);
  };
  const removeSync = (
    path: string | URL,
    options?: { recursive?: boolean },
  ) => {
    const resolved = fs.resolve(path);
    if (!fs.remove(resolved, options?.recursive)) {
      throw notFound("remove", resolved);
    }
  };
  const realPathSync = (path: string | URL) => {
    const resolved = fs.resolve(path);
    if (!fs.stat(resolved)) throw notFound("realpath", resolved);
    return resolved;
  };
  let tempCounter = 0;
  const makeTempDirSync = (options?: { prefix?: string; dir?: string }) => {
    const dir = `${options?.dir ?? "/tmp"}/${options?.prefix ?? ""}${
      Date.now().toString(36)
    }${(tempCounter++).toString(36)}`;
    fs.addDir(normalize(dir, cwd));
    return normalize(dir, cwd);
  };
  const openSync = (
    path: string | URL,
    options?: { write?: boolean; create?: boolean; append?: boolean },
  ) => {
    const resolved = fs.resolve(path);
    if (options?.write || options?.create || options?.append) {
      if (!fs.files.has(resolved)) fs.write(resolved, new Uint8Array());
      return {
        rid: -1,
        readable: new ReadableStream<Uint8Array>({
          start: (c) => c.close(),
        }),
        writable: new WritableStream<Uint8Array>({
          write: (chunk) => writeFileSync(resolved, chunk, { append: true }),
        }),
        stat: () => Promise.resolve(stat(resolved)),
        statSync: () => stat(resolved),
        close() {},
        [Symbol.dispose]() {},
      };
    }
    return readHandle(readFileSync(resolved), resolved);
  };

  /** A read-only `Deno.FsFile`-like handle over `bytes`: `readable` plus the
   *  Reader API (`read`/`readSync`), which `readAll` and friends use. */
  const readHandle = (bytes: Uint8Array, resolved: string) => {
    let offset = 0;
    const readSync = (p: Uint8Array): number | null => {
      if (offset >= bytes.byteLength) return null;
      const n = Math.min(p.byteLength, bytes.byteLength - offset);
      p.set(bytes.subarray(offset, offset + n));
      offset += n;
      return n;
    };
    return {
      rid: -1,
      readable: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
      read: (p: Uint8Array) => Promise.resolve(readSync(p)),
      readSync,
      stat: () => Promise.resolve(stat(resolved)),
      statSync: () => stat(resolved),
      close() {},
      [Symbol.dispose]() {},
    };
  };

  const async =
    <A extends unknown[], R>(fn: (...args: A) => R) =>
    (...args: A): Promise<R> => {
      try {
        return Promise.resolve(fn(...args));
      } catch (err) {
        return Promise.reject(err);
      }
    };

  const inspect = (value: unknown, _opts?: unknown): string => {
    if (typeof value === "string") return value;
    if (value instanceof Error) return value.stack ?? String(value);
    try {
      return JSON.stringify(value, null, 2) ?? String(value);
    } catch {
      return String(value);
    }
  };

  const output = (log: (msg: string) => void) => ({
    write: (bytes: Uint8Array) => {
      log(decoder.decode(bytes));
      return Promise.resolve(bytes.byteLength);
    },
    writeSync: (bytes: Uint8Array) => {
      log(decoder.decode(bytes));
      return bytes.byteLength;
    },
    writable: new WritableStream<Uint8Array>({
      write: (chunk) => log(decoder.decode(chunk)),
    }),
    isTerminal: () => false,
    close() {},
    rid: -1,
  });

  const granted = { state: "granted", onchange: null, partial: false };
  const denied = { state: "denied", onchange: null, partial: false };
  // "write" is denied: the file system is an in-memory overlay that lives as
  // long as the isolate (128 MB). Code that probes for a writable disk before
  // using one (deco's FILE_SYSTEM loader cache, `WEB_CACHE_ENGINE=FILE_SYSTEM`)
  // must fall back instead of filling the isolate's memory. Writes themselves
  // still work, for code that writes small files without asking.
  const permissionFor = (desc?: { name?: string }) =>
    desc?.name === "write" ? denied : granted;
  const neverWatcher = () => {
    let close: () => void = () => {};
    const closed = new Promise<void>((resolve) => (close = resolve));
    return {
      close,
      [Symbol.dispose]: close,
      // An FsWatcher that never emits: there is nothing to watch.
      [Symbol.asyncIterator]: () => ({
        next: () =>
          closed.then(() => ({ done: true as const, value: undefined })),
      }),
    };
  };

  const Command = class {
    constructor(_cmd: string | URL, _opts?: unknown) {}
    output = notSupported(errors, "Command#output");
    outputSync = notSupported(errors, "Command#outputSync");
    spawn = notSupported(errors, "Command#spawn");
  };

  const Deno = {
    __decoWorkerdShim: { setEnv, fs },
    errors,
    build: {
      target: "x86_64-unknown-linux-gnu",
      arch: "x86_64",
      os: "linux",
      vendor: "unknown",
      env: "gnu",
    },
    version: {
      deno: opts.denoVersion ?? "1.46.3",
      v8: "workerd",
      typescript: "5.5.2",
    },
    pid: 1,
    ppid: 0,
    noColor: true,
    args: [] as string[],
    mainModule: `file://${cwd}/main.ts`,
    customInspect: Symbol.for("Deno.customInspect"),
    inspect,
    env: {
      get: (key: string) => envStore.get(key),
      has: (key: string) => envStore.has(key),
      set: (key: string, value: string) => void envStore.set(key, value),
      delete: (key: string) => void envStore.delete(key),
      toObject: () => Object.fromEntries(envStore),
    },
    cwd: () => cwd,
    chdir: (dir: string | URL) => {
      cwd = fs.resolve(dir);
    },
    execPath: () => "/usr/local/bin/deno",
    hostname: () => "workerd",
    osRelease: () => "workerd",
    osUptime: () => 0,
    loadavg: () => [0, 0, 0],
    uid: () => null,
    gid: () => null,
    systemMemoryInfo: () => ({
      total: 0,
      free: 0,
      available: 0,
      buffers: 0,
      cached: 0,
      swapTotal: 0,
      swapFree: 0,
    }),
    memoryUsage: () => ({ rss: 0, heapTotal: 0, heapUsed: 0, external: 0 }),
    exit: (code = 0): never => {
      throw new Error(`Deno.exit(${code}) called on workerd`);
    },
    exitCode: 0,
    isatty: () => false,
    stdin: { isTerminal: () => false, rid: 0, readable: null },
    stdout: output((msg) => console.log(msg.trimEnd())),
    stderr: output((msg) => console.error(msg.trimEnd())),
    permissions: {
      query: (desc?: { name?: string }) => Promise.resolve(permissionFor(desc)),
      querySync: permissionFor,
      request: (desc?: { name?: string }) =>
        Promise.resolve(permissionFor(desc)),
      requestSync: permissionFor,
      // Permissions are fixed on workerd: revoking changes nothing.
      revoke: (desc?: { name?: string }) =>
        Promise.resolve(permissionFor(desc)),
    },
    // timers and signals
    unrefTimer: () => {},
    refTimer: () => {},
    addSignalListener: () => {},
    removeSignalListener: () => {},
    // fs (sync)
    statSync: stat,
    lstatSync: stat,
    readFileSync,
    readTextFileSync,
    readDirSync,
    mkdirSync,
    writeFileSync,
    writeTextFileSync: writeFileSync,
    removeSync,
    realPathSync,
    makeTempDirSync,
    openSync,
    renameSync: (from: string | URL, to: string | URL) => {
      const bytes = readFileSync(from);
      writeFileSync(to, bytes);
      removeSync(from);
    },
    // fs (async)
    stat: async(stat),
    lstat: async(stat),
    readFile: (path: string | URL) => {
      const resolved = fs.resolve(path);
      return fs.lazy.has(resolved)
        ? loadLazy(resolved)
        : async(readFileSync)(path);
    },
    readTextFile: (path: string | URL) => {
      const resolved = fs.resolve(path);
      return fs.lazy.has(resolved)
        ? loadLazy(resolved).then((bytes) => decoder.decode(bytes))
        : async(readTextFileSync)(path);
    },
    readDir: (path: string | URL) => {
      const entries = readDirSync(path);
      return (async function* () {
        yield* entries;
      })();
    },
    mkdir: async(mkdirSync),
    writeFile: async(writeFileSync),
    writeTextFile: async(writeFileSync),
    remove: async(removeSync),
    realPath: async(realPathSync),
    makeTempDir: async(makeTempDirSync),
    open: (
      path: string | URL,
      options?: { write?: boolean; create?: boolean; append?: boolean },
    ) => {
      const resolved = fs.resolve(path);
      if (
        fs.lazy.has(resolved) &&
        !(options?.write || options?.create || options?.append)
      ) {
        return loadLazy(resolved).then((bytes) => readHandle(bytes, resolved));
      }
      return async(openSync)(path, options);
    },
    rename: async((from: string | URL, to: string | URL) => {
      const bytes = readFileSync(from);
      writeFileSync(to, bytes);
      removeSync(from);
    }),
    link: notSupported(errors, "link"),
    symlink: notSupported(errors, "symlink"),
    watchFs: neverWatcher,
    // processes, servers and storage that do not exist on workerd
    Command,
    run: notSupported(errors, "run"),
    serve: notSupported(errors, "serve"),
    listen: notSupported(errors, "listen"),
    connect: notSupported(errors, "connect"),
    openKv: notSupported(errors, "openKv"),
    cron: notSupported(errors, "cron"),
    upgradeWebSocket: (_req: Request) => {
      const Pair = g.WebSocketPair;
      if (!Pair) throw new errors.NotSupported("WebSocketPair is unavailable");
      const [client, server] = Object.values(new Pair()) as any[];
      server.accept();
      return {
        socket: server as WebSocket,
        response: new Response(null, {
          status: 101,
          webSocket: client,
        } as ResponseInit),
      };
    },
  };

  g.Deno = Deno;

  // workerd rejects `capture: true` on the global scope, which apps use for
  // `unhandledrejection`. The global scope has no capture phase, so drop it.
  const addEventListener = g.addEventListener?.bind(globalThis);
  if (addEventListener) {
    g.addEventListener = (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) =>
      addEventListener(
        type,
        listener,
        typeof options === "object"
          ? { ...options, capture: false }
          : undefined,
      );
  }
}
