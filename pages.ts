import { Page } from "./types.ts";

export const getPages = async (): Promise<Page[]> => {
  return await Promise.resolve([{ name: "default" }]);
};
