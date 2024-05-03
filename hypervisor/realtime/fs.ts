import { FSError, type RealtimeState } from "../deps.ts";
import { HypervisorDiskStorage } from "./object.ts";

export const createDurableFS = (state: RealtimeState) => {
  const storage = state.storage;
  const addMethods: Partial<HypervisorDiskStorage> = {};
  if (state.storage instanceof HypervisorDiskStorage) {
    addMethods.watch = state.storage.watch.bind(state.storage);
  }

  return {
    ...addMethods,
    readFile: async (filepath: string): Promise<string> => {
      const fileContent = await storage.get(filepath);
      if (!fileContent) {
        throw new FSError(`ENOENT`, `No such file or directory: ${filepath}`);
      }
      return fileContent as string;
    },
    writeFile: async (filepath: string, content: string) => {
      try {
        await storage.put(filepath, content);
      } catch (error) {
        console.error("Error writing file:", error);
        throw error;
      }
    },
    unlink: async (filepath: string) => {
      try {
        await storage.delete(filepath);
      } catch (error) {
        console.error("Error deleting file:", error);
        throw error;
      }
    },
    readdir: async (filepath: string) => {
      try {
        const dirEntries = await storage.list();
        return [
          ...dirEntries.keys(),
        ].filter((key: string) => key.startsWith(filepath));
      } catch (error) {
        console.error("Error reading directory:", error);
        throw error;
      }
    },
    clear: async () => {
      try {
        await storage.deleteAll();
      } catch (error) {
        console.error("Error clearing storage:", error);
        throw error;
      }
    },
  };
};
