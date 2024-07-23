import { debounce } from "std/async/debounce.ts";
import { walk } from "std/fs/walk.ts";
import { basename, join, posix, SEP } from "std/path/mod.ts";
import getBlocks from "../../blocks/index.ts";
import { Context } from "../../live.ts";
import { exists } from "../../utils/filesystem.ts";
import { Mutex } from "../../utils/sync.ts";
import type {
  Decofile,
  DecofileProvider,
  OnChangeCallback,
  ReadOptions,
} from "./provider.ts";
import type { VersionedDecofile } from "./realtime.ts";

export const DECO_FOLDER = ".deco";
export const BLOCKS_FOLDER = "blocks";
export const METADATA_FOLDER = "metadata";
export const BLOCKS_JSON = "blocks.json";

export const METADATA_PATH =
  `${DECO_FOLDER}/${METADATA_FOLDER}/${BLOCKS_JSON}`;

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

export const getFromDecoFolder = async (): Promise<[string, unknown][]> => {
  const paths = [];

  const walker = walk(join(DECO_FOLDER, BLOCKS_FOLDER), {
    includeDirs: false,
    includeFiles: true,
    includeSymlinks: false,
  });

  for await (const entry of walker) {
    paths.push(entry.path);
  }

  return Promise.all(
    paths.map(async (path) =>
      [
        `/${path.replaceAll(SEP, posix.sep)}`,
        JSON.parse(await Deno.readTextFile(path)),
      ] as [string, unknown]
    ),
  );
};

export const genMetadataFromFS = (entries: [string, unknown][]) => {
  const knownBlockTypes = new Set(getBlocks().map((x) => x.type));

  const metadata = entries.map((
    [path, content],
  ) => [path, inferMetadata(content, knownBlockTypes)]);

  return Object.fromEntries(metadata);
};

export const newFsFolderProviderFromPath = (
  fullPath: string,
): DecofileProvider => {
  const onChangeCbs: OnChangeCallback[] = [];
  let decofile: Promise<VersionedDecofile> = exists(fullPath, {
    isDirectory: true,
    isReadable: true,
  }).then(
    async () => {
      const decofile: Decofile = {};
      const files = Deno.readDir(fullPath);
      for await (const file of files) {
        if (file.isFile) {
          const content = await Deno.readTextFile(join(fullPath, file.name))
            .then(JSON.parse)
            .catch(() => null);
          if (content !== null) {
            decofile[parseBlockId(file.name)] = content;
          }
        }
      }
      return {
        state: decofile,
        revision: Context.active().deploymentId ?? `${Date.now()}`,
      };
    },
  ).then((result) => {
    (async () => {
      const limiter = new Mutex();
      const watcher = Deno.watchFs(fullPath);
      let filesChangedBatch: string[] = [];
      const updateState = debounce(async () => {
        using _ = await limiter.acquire();

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
            const content = await Deno.readTextFile(filePath)
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
export const newFsFolderProvider = (
  path = BLOCKS_FOLDER,
): DecofileProvider => {
  const fullPath = join(Deno.cwd(), path);
  return newFsFolderProviderFromPath(fullPath);
};
