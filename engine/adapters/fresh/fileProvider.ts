import { ConfigProvider } from "$live/engine/adapters/fresh/manifest.ts";

export const useFileProvider = (file: string): ConfigProvider => {
  return {
    get: (id) => {
      const state = JSON.parse(Deno.readTextFileSync(file));
      return state[id];
    },
  };
};
