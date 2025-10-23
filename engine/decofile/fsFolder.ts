import { Mutex } from "@core/asyncutil/mutex";
import { debounce } from "@std/async/debounce";
import { ensureFile } from "@std/fs";
import { walk } from "@std/fs/walk";
import { basename, join } from "@std/path";
import getBlocks from "../../blocks/index.ts";
import { Context } from "../../deco.ts";
import { exists } from "../../utils/filesystem.ts";
import { BLOCKS_FOLDER, DECO_FOLDER, METADATA_PATH } from "./constants.ts";
import type {
  Decofile,
  DecofileProvider,
  OnChangeCallback,
  ReadOptions,
} from "./provider.ts";
import type { VersionedDecofile } from "./realtime.ts";

export const parseBlockId = (filename: string) =>
  decodeURIComponent(filename.slice(0, filename.length - ".json".length));

const inferBlockType = (resolveType: string, knownBlockTypes: Set<string>) => {
  const segments = resolveType.split("/");

  const blockType = segments.find((s) => knownBlockTypes.has(s));

  return blockType;
};

const inferMetadata = (content: unknown, knownBlockTypes: Set<string>) => {
  try {
    const { __resolveType, name, path } = content as Record<string, string>;
    const blockType = inferBlockType(__resolveType, knownBlockTypes);

    if (!blockType) {
      return null;
    }

    if (blockType === "pages") {
      return {
        name: name,
        path: path,
        blockType,
        __resolveType,
      };
    }

    return {
      blockType,
      __resolveType,
    };
    // TODO @gimenes: when the json is wrong, we should somehow resolve to a standard block that talks well to the admin so the user can fix it somehow
  } catch {
    return null;
  }
};
const denoFs: Fs = {
  readTextFile: Deno.readTextFile,
  cwd: Deno.cwd,
  readDir: async function* (path: string) {
    for await (const entry of Deno.readDir(path)) {
      if (entry.isFile) {
        yield entry.name;
      }
    }
  },
  writeTextFile: Deno.writeTextFile,
  watchFs: Deno.watchFs,
  ensureFile,
};
/** Syncs FileSystem Metadata with Storage metadata */
export const genMetadata = async (fs: Fs = denoFs) => {
  try {
    const knownBlockTypes = new Set(getBlocks().map((x) => x.type));
    const paths = [];

    const walker = walk(join(DECO_FOLDER, BLOCKS_FOLDER), {
      includeDirs: false,
      includeFiles: true,
      includeSymlinks: false,
    });

    for await (const entry of walker) {
      paths.push(entry.path);
    }

    const entries = await Promise.all(
      paths.map(async (path) =>
        [
          `/${path.replaceAll("\\", "/")}`,
          JSON.parse(await fs.readTextFile(path)),
        ] as [string, unknown]
      ),
    );

    const metadata = Object.fromEntries(entries.map((
      [path, content],
    ) => [path, inferMetadata(content, knownBlockTypes)]));

    const pathname = join(fs.cwd(), METADATA_PATH);
    await fs.ensureFile(pathname);
    await fs.writeTextFile(pathname, JSON.stringify(metadata));
  } catch {
    /** ok */
  }
};

export const newFsFolderProviderFromPath = (
  fullPath: string,
  fs: Fs = denoFs,
): DecofileProvider => {
  const onChangeCbs: OnChangeCallback[] = [];
  let decofile: Promise<VersionedDecofile> = exists(fullPath, {
    isDirectory: true,
    isReadable: true,
  }).then(
    async () => {
      const decofile: Decofile = {};
      const files = fs.readDir(fullPath);
      const promises: Promise<unknown>[] = [];
      for await (const file of files) {
        promises.push(
          fs.readTextFile(join(fullPath, file))
            .then(JSON.parse)
            .then((content) => {
              if (content !== null) {
                decofile[parseBlockId(file)] = content;
              }
            })
            .catch(() => null),
        );
      }
      await Promise.all(promises);
      return {
        state: decofile,
        revision: Context.active().isPreview
          ? `${Date.now()}`
          : Context.active().deploymentId ?? `${Date.now()}`,
      };
    },
  ).then((result) => {
    (async () => {
      const limiter = new Mutex();
      const watcher = fs.watchFs(fullPath);
      let filesChangedBatch: string[] = [];
      const updateState = debounce(async () => {
        using _lock = await limiter.acquire();

        // for each filesChangedBatch read them all
        // and update the state
        // make filesChangedBatch empty
        if (filesChangedBatch.length === 0) {
          return;
        }
        const copied = [...new Set(filesChangedBatch)];
        filesChangedBatch.length = 0;
        filesChangedBatch = [];
        const { state: prevState } = await decofile;
        const changedBlocks: Decofile = {};
        await Promise.all(
          copied.map(async (filePath) => {
            const content = await fs.readTextFile(filePath)
              .then(JSON.parse)
              .catch(() => null);
            changedBlocks[parseBlockId(basename(filePath))] = content;
          }),
        );
        decofile = Promise.resolve({
          state: { ...prevState, ...changedBlocks },
          revision: `${Date.now()}`,
        });
        for (const cb of onChangeCbs) {
          cb();
        }
      }, 300);
      for await (const event of watcher) {
        filesChangedBatch.push(...event.paths);
        updateState();
      }
    })();

    return result;
  });

  const state = async (_options: ReadOptions | undefined) => {
    return await decofile.then((r) => r.state);
  };

  return {
    state,
    set: (state, rev) => {
      decofile = Promise.resolve({
        state,
        revision: rev ?? `${Date.now()}`,
      });
      for (const cb of onChangeCbs) {
        cb();
      }
      return Promise.resolve();
    },
    onChange: (cb: OnChangeCallback) => {
      onChangeCbs.push(cb);
    },
    revision: () => decofile.then((r) => r.revision),
  };
};

export interface Fs {
  readTextFile: (path: string) => Promise<string>;
  cwd: () => string;
  readDir: (
    path: string,
  ) => AsyncIterable<
    string
  >;
  writeTextFile: (path: string, content: string) => Promise<void>;
  watchFs: (path: string) => AsyncIterable<{ paths: string[] }>;
  ensureFile: (path: string) => Promise<void>;
}

export const newFsFolderProvider = (
  path = BLOCKS_FOLDER,
  fs: Fs = denoFs,
): DecofileProvider => {
  const fullPath = join(fs.cwd(), path);
  return newFsFolderProviderFromPath(fullPath, fs);
};
