import { IslandModule } from "$fresh/src/server/types.ts";
import { HandlerContext, Manifest, Plugin } from "$fresh/server.ts";
import { JSONSchema7 } from "https://esm.sh/v92/@types/json-schema@7.0.11/X-YS9yZWFjdDpwcmVhY3QvY29tcGF0CmQvcHJlYWN0QDEwLjEwLjY/index.d.ts";

export type Schema = JSONSchema7;
export type Schemas = Record<string, Schema>;

export interface Module extends IslandModule {
  schema?: JSONSchema7;
}

export interface Loader {
  loader: (
    req: Request,
    ctx: HandlerContext<any>,
    props: any,
  ) => Promise<unknown>;
  inputSchema: JSONSchema7;
  outputSchema: { "$ref": NonNullable<JSONSchema7["$ref"]> };
}

export interface LoaderModule {
  default: Loader;
}

export interface DecoManifest extends Manifest {
  islands: Record<string, Module>;
  components: Record<string, Module>;
  loaders: Record<string, LoaderModule>;
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

export interface Flag {
  id: string;
  name: string;
  audience: string;
  traffic: number;
  active?: boolean;
  path: string;
  components?: {
    components: PageComponentData[];
    loaders: PageLoaderData[];
  };
}

export type Mode = "edit" | "none";

export interface PageLoaderData {
  name: string;
  loader: string;
  props?: Record<string, unknown>;
}
