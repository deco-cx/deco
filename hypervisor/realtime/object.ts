import { Tar } from "std/archive/tar.ts";
import { ensureDir } from "std/fs/ensure_dir.ts";
import { exists } from "std/fs/exists.ts";
import { walk } from "std/fs/walk.ts";
import { Buffer } from "std/io/buffer.ts";
import { basename, dirname, globToRegExp, join } from "std/path/mod.ts";
import { copy } from "std/streams/copy.ts";
import { logger } from "../../observability/otel/config.ts";
import { fileSeparatorToSlash } from "../../utils/filesystem.ts";
import { Mutex } from "../../utils/sync.ts";
import { type File, gitIgnore, type RealtimeState } from "../deps.ts";

const encoder = new TextEncoder();
const SOURCE_PATH = Deno.env.get("SOURCE_ASSET_PATH");
const DEPLOYMENT_ID = Deno.env.get("DENO_DEPLOYMENT_ID");
const SHOULD_PERSIST_STATE = SOURCE_PATH !== undefined &&
  DEPLOYMENT_ID !== undefined;
const CHANGESET_FILE = "/.metadata/changeset.json";
const IGNORE_FILES_GLOB = [".git/**"];
type RealtimeStorage = RealtimeState["storage"];

export interface FsEvent {
  type: "create" | "delete" | "modify";
  path: string;
}
export interface DiskStorageOptions {
  dir: string;
  buildFiles?: string;
}

const persistStateLimiter = new Mutex();

// create sync back from disk to memory
export class HypervisorDiskStorage implements RealtimeStorage {
  private ignore: { includes: (str: string) => boolean } = {
    includes: () => true,
  };
  private dir: string;
  public onChange?: (events: FsEvent[]) => void;
  constructor(opts: DiskStorageOptions) {
    this.dir = opts.dir;
    const buildFilesRegExp = opts.buildFiles
      ? globToRegExp(opts.buildFiles)
      : undefined;
    let ignoreContent = null;
    try {
      ignoreContent = Deno.readTextFileSync(
        join(this.dir, ".gitignore"),
      );
    } catch (_err) {
      // ignore in case of does not exists
    }
    const globs = [...ignoreContent?.split("\n") ?? [], ...IGNORE_FILES_GLOB];
    const ignore = gitIgnore.default();
    globs && ignore.add(globs);
    this.ignore = {
      includes: (str) => {
        if (str === CHANGESET_FILE) {
          return false;
        }
        const isBuildFile = buildFilesRegExp &&
          buildFilesRegExp?.test(str) === true;
        return !isBuildFile && ignore.ignores(str.slice(1));
      },
    };
  }
  normalizePath(path: string) {
    return fileSeparatorToSlash(path);
  }
  /**
   * this is different from "onChange" this this is triggered by filesystem and avoid being triggered by itself.
   */
  async *watch() {
    const watchKinds: Deno.FsEvent["kind"][] = [
      "create",
      "modify",
      "remove",
    ];
    for await (const event of Deno.watchFs(this.dir, { recursive: true })) {
      const { kind, paths } = event;
      if (!watchKinds.includes(kind)) {
        continue;
      }
      const changedFiles: Record<string, File> = {};
      const updatePath = async (path: string) => {
        const virtualPath = this.normalizePath(path.replace(this.dir, ""));

        if (kind === "remove") {
          changedFiles[virtualPath] = { content: null as unknown as string };
          return;
        }
        const isFile = await exists(path, { isFile: true, isReadable: true });
        if (!isFile) return;
        if (this.ignore.includes(virtualPath)) {
          return;
        }
        const fileContent = await Deno.readTextFile(
          path,
        ).catch((err) => {
          if (err instanceof Deno.errors.NotFound) {
            return null;
          }
          throw err;
        });
        if (fileContent) {
          changedFiles[virtualPath] = { content: fileContent };
        }
      };
      await Promise.all(paths.map(updatePath));
      yield changedFiles;
    }
  }

  async get<T = unknown>(key: string): Promise<T | undefined>;
  async get<T = unknown>(keys: string[]): Promise<Map<string, T>>;
  async get<T = unknown>(
    keys: string | string[],
  ): Promise<T | undefined | Map<string, T>> {
    const filePaths = Array.isArray(keys)
      ? keys.map((k) => join(this.dir, k))
      : join(this.dir, keys);
    try {
      if (Array.isArray(keys)) {
        const data = new Map<string, T>();
        for (const filePath of filePaths) {
          const fileContent = await Deno.readTextFile(filePath);
          data.set(filePath.split("/").pop()!, fileContent as T);
        }
        return data;
      } else {
        const fileContent = await Deno.readTextFile(filePaths as string);
        return fileContent as T;
      }
    } catch (_error) {
      console.error("error getting keys", _error);
      return undefined;
    }
  }

  async delete(key: string): Promise<boolean>;
  async delete(keys: string[]): Promise<number>;
  async delete(keys: string | string[]): Promise<boolean | number> {
    const filePaths = Array.isArray(keys)
      ? keys.map((k) => join(this.dir, k))
      : [join(this.dir, keys)];
    try {
      let deletedCount = 0;
      for (const filePath of filePaths) {
        await Deno.remove(filePath);
        deletedCount++;
      }
      this.onChange?.(
        filePaths.map((path) => ({ type: "delete", path })),
      );
      return Array.isArray(keys) ? deletedCount : true;
    } catch (_error) {
      console.error("error deleting keys", _error);

      return Array.isArray(keys) ? 0 : false;
    }
  }

  async put<T>(key: string, value: T): Promise<void>;
  async put<T>(entries: Record<string, T>): Promise<void>;
  async put(
    key: string | Record<string, unknown>,
    value?: unknown,
  ): Promise<void> {
    const entries = typeof key === "string" ? { [key]: value } : key;
    const events: FsEvent[] = [];
    for (const [entryKey, entryValue] of Object.entries(entries)) {
      const filePath = join(this.dir, entryKey);
      const fileExists = await exists(filePath, { isFile: true });
      events.push({
        type: fileExists ? "modify" : "create",
        path: filePath,
      });
      !fileExists && await ensureDir(dirname(filePath));
      await Deno.writeTextFile(filePath, entryValue as string);
    }
    this.onChange?.(events);
  }

  async deleteAll(): Promise<void> {
    const dirEntries = Deno.readDir(this.dir);
    try {
      for await (const dirEntry of dirEntries) {
        await Deno.remove(join(this.dir, dirEntry.name), { recursive: true })
          .catch((err) => {
            console.log("ignoring", err);
          });
      }
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) {
        return;
      }
      throw err;
    }
  }

  async list<T = unknown>(): Promise<Map<string, T>> {
    const data = new Map<string, T>();
    try {
      for await (const walkEntry of walk(this.dir)) {
        if (walkEntry.isDirectory) continue;
        const virtualPath = this.normalizePath(
          walkEntry.path.replace(this.dir, ""),
        );
        if (this.ignore.includes(virtualPath)) {
          continue;
        }
        const fileContent = await Deno.readTextFile(
          walkEntry.path,
        );
        data.set(virtualPath, fileContent as T);
      }

      return data;
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) {
        return new Map();
      }
      throw err;
    }
  }
}

export interface HypervisorRealtimeStateOptions {
  storage: RealtimeStorage;
}
export class HypervisorRealtimeState<T = unknown> implements RealtimeState {
  private blockConcurrencyWhilePromise: Promise<T> | undefined;
  public storage: RealtimeStorage;
  constructor(options: HypervisorRealtimeStateOptions) {
    this.storage = options.storage;
  }

  blockConcurrencyWhile(cb: () => Promise<T>): Promise<T> {
    this.blockConcurrencyWhilePromise = this.blockConcurrencyWhilePromise
      ? this.blockConcurrencyWhilePromise.then(() => cb())
      : cb();
    return this.blockConcurrencyWhilePromise;
  }

  public wait() {
    return this?.blockConcurrencyWhilePromise ?? Promise.resolve();
  }

  public async persist(outfile: string, isEnvironmentPersistence?: boolean) {
    const tar = new Tar();
    const allFiles = await this.storage.list<string>();
    const tasks: Promise<void>[] = [];
    for (const [path, content] of allFiles.entries()) {
      if (
        !content ||
        (path === CHANGESET_FILE)
      ) {
        continue;
      }
      const encoded = encoder.encode(content);
      tasks.push(tar.append(path, {
        reader: new Buffer(encoded),
        contentSize: encoded.byteLength,
      }));
    }
    if (isEnvironmentPersistence) {
      const changeSetContent = await this.storage.get<string>(CHANGESET_FILE)
        .catch(() => {
          return undefined;
        });
      if (changeSetContent) {
        const encoded = encoder.encode(changeSetContent);
        tasks.push(tar.append(CHANGESET_FILE, {
          reader: new Buffer(encoded),
          contentSize: encoded.byteLength,
        }));
      }
    }
    await Promise.all(tasks);
    const ensureDirPromise = ensureDir(dirname(outfile));
    const startOut = performance.now();
    const outtempFile = await Deno.makeTempFile({
      prefix: "assets_",
      suffix: ".tar",
    });
    const writer = await Deno.open(outtempFile, {
      write: true,
      create: true,
    });
    await copy(tar.getReader(), writer);
    writer.close();
    console.log("writing file done", performance.now() - startOut);
    await ensureDirPromise;
    const startCopy = performance.now();
    console.log("copying file", outtempFile, "=>", outfile);
    await Deno.copyFile(outtempFile, outfile); // it needs to be copy instead of rename
    await Deno.remove(outtempFile).catch((err) => {
      console.error(err);
    });
    console.log("copy file done", performance.now() - startCopy);
  }
  public shouldPersistState() {
    return SHOULD_PERSIST_STATE;
  }
  public async persistState() {
    if (!this.shouldPersistState()) {
      return;
    }
    if (!persistStateLimiter.freeOrNext()) { //once per time having the limit of 1 waiting
      return;
    }
    using _ = await persistStateLimiter.acquire();
    const outfile = join(
      dirname(SOURCE_PATH!),
      `${DEPLOYMENT_ID}.tar`,
    );
    console.log(`persisting state at ${outfile}`);
    await this.persist(outfile, true).catch((err) => {
      console.error(`could not persist state at ${outfile}`, err);
      logger.error(
        `could not persist state at ${outfile} ${err?.message} ${
          JSON.stringify(err)
        }`,
      );
    });
  }
  public async persistNext(commitSha: string) {
    if (!SOURCE_PATH) {
      return;
    }
    const outfile = join(
      SOURCE_PATH,
      "..",
      "..",
      commitSha,
      basename(SOURCE_PATH),
    );
    await Promise.all([this.persist(outfile), this.persistState()]);
    await this.storage.delete(CHANGESET_FILE).catch((err) => {
      console.log("ignoring delete error", err);
    });
  }
}
