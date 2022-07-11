import { IslandModule } from "$fresh/src/server/types.ts";
import { Manifest } from "$fresh/server.ts";
import { Configuration } from "twind";

export interface DecoManifest extends Manifest {
  components?: Record<string, IslandModule>;
  twind?: Configuration;
}

export interface DecoState {
  manifest: DecoManifest;
}
