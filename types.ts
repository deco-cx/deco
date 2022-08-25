import { IslandModule } from "$fresh/src/server/types.ts";
import { Manifest } from "$fresh/server.ts";
import { Configuration } from "twind";

export interface DecoManifest extends Manifest {
  components?: Record<string, IslandModule>;
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
  id: string;
  component: string;
  props?: Record<string, unknown>;
}
