import { Site } from "../types.ts";

export const getSites = async (): Promise<Site[]> => {
  return await Promise.resolve([{ name: "default" }]);
};

if (import.meta.main) {
  console.log("Called directly");
}
