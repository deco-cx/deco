// Web Worker for schema generation
import type { AppManifest, ImportMap } from "../../blocks/app.ts";
import { genSchemasFromManifest } from "./gen.ts";
import type { Schemas } from "./builder.ts";

export interface SchemaWorkerMessage {
  id: string;
  type: "generate";
  payload: {
    manifest: AppManifest;
    importMap: ImportMap;
    baseDir: string;
  };
}

export interface SchemaWorkerResponse {
  id: string;
  type: "success" | "error";
  payload: Schemas | { error: string };
}

self.addEventListener(
  "message",
  async (event: MessageEvent<SchemaWorkerMessage>) => {
    const { id, type, payload } = event.data;

    if (type === "generate") {
      try {
        const { manifest, importMap, baseDir } = payload;
        const schemas = await genSchemasFromManifest(
          manifest,
          baseDir,
          importMap,
        );

        const response: SchemaWorkerResponse = {
          id,
          type: "success",
          payload: schemas,
        };

        self.postMessage(response);
      } catch (error) {
        const response: SchemaWorkerResponse = {
          id,
          type: "error",
          payload: {
            error: (error as Error).message || "Unknown error occurred",
          },
        };

        self.postMessage(response);
      }
    }
  },
);
