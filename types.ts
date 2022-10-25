import type { IslandModule } from "$fresh/src/server/types.ts";
import type { HandlerContext, Manifest } from "$fresh/server.ts";
import type { JSONSchema7 } from "json-schema";

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
  ) => Promise<Record<string | number | symbol, unknown>>;
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
  id: number;
  name: string;
}

export interface Page {
  name: string;
}

export interface LiveOptions {
  site: string;
  siteId: number;
  loginUrl?: string;
  domains?: string[];
}

export interface PageComponentData {
  id: string;
  component: string;
  props?: Record<string, unknown>;
}

export interface PageLoaderData {
  name: string;
  loader: string;
  props?: Record<string, unknown>;
}

export interface PageData {
  title: string;
  components: PageComponentData[];
  loaders: PageLoaderData[];
  editorComponents?: PageComponentData[];
  mode?: Mode;
  schemas?: Schemas;
  template?: string;
}

export interface Flag {
  id: string;
  name: string;
  audience: string;
  traffic: number;
  active?: boolean;
  path: string;
}

export type Mode = "edit" | "none";

interface ConfigurablePageEntity {
  // "./components/Header.tsx"
  name: string; // Maybe changing this to 'path' instead
  // "Header-432js"
  id: string;
  props?: Record<string, any>;
  schema?: JSONSchema7;
}

export interface EditorData {
  title: string;
  components: Array<ConfigurablePageEntity>;
  loaders: Array<ConfigurablePageEntity>;
}
