import { IslandModule, Plugin } from "$fresh/src/server/types.ts";
import { Manifest } from "$fresh/server.ts";
import { JSONSchema7 } from "https://esm.sh/v92/@types/json-schema@7.0.11/X-YS9yZWFjdDpwcmVhY3QvY29tcGF0CmQvcHJlYWN0QDEwLjEwLjY/index.d.ts";

export type Schema = JSONSchema7 | null;
export type Schemas = Record<string, Schema>;

export interface DecoManifest extends Manifest {
  components?: Record<string, IslandModule>;
  schemas: Schemas;
}

export interface Site {
  name: string;
}

export interface Page {
  name: string;
}

export interface LiveOptions {
  site: string;
  domains?: string[];
  plugins?: Plugin[];
}

export interface PageComponentData {
  component: string;
  props?: Record<string, unknown>;
}

export type Mode = "edit" | "none";
