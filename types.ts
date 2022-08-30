import { IslandModule } from "$fresh/src/server/types.ts";
import { Manifest } from "$fresh/server.ts";
import { Configuration } from "twind";

export type Schema = Record<string, any> | null;
export type Schemas = Record<string, Schema>;

export interface DecoManifest extends Manifest {
  components?: Record<string, IslandModule>;
  schemas: Schemas;
  twind?: Configuration;
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
}

export interface PageComponentData {
  component: string;
  props?: Record<string, unknown>;
}
