import { debounce } from "std/async/debounce.ts";
import { basename, join } from "std/path/mod.ts";
import { exists } from "../../utils/filesystem.ts";
import { Mutex } from "../../utils/sync.ts";
import type {
  Decofile,
  DecofileProvider,
  OnChangeCallback,
  ReadOptions,
} from "./provider.ts";
import type { VersionedDecofile } from "./realtime.ts";

export const BLOCKS_FOLDER = "blocks";

const parseBlockId = (filename: string) =>
  decodeURIComponent(filename.slice(0, filename.length - ".json".length));

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
        revision: `${Date.now()}`,
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
