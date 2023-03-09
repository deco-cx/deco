import { ConfigProvider } from "$live/engine/adapters/fresh/manifest.ts";

export const useFileProvider = (file: string): ConfigProvider => {
  return {
    get: (id) => {
      const state = JSON.parse(Deno.readTextFileSync(file));
      return state[id];
    },
  };
};

export const useDataProvider = (data: Record<string, any>): ConfigProvider => {
  return {
    get: <T>(id: string) => {
      return data[id] as T;
    },
  };
};
