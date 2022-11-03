import type { IslandModule } from "$fresh/src/server/types.ts";
import type { HandlerContext, Manifest } from "$fresh/server.ts";
import type { JSONSchema7 } from "json-schema";

export type Schema = JSONSchema7;

export interface Module extends IslandModule {
  schema?: JSONSchema7;
}

export interface Loader {
  loader: (req: Request, ctx: HandlerContext<any>, props: any) => Promise<any>;
  inputSchema: JSONSchema7;
  outputSchema: { $ref: NonNullable<JSONSchema7["$ref"]> };
}

export interface LoaderModule {
  default: Loader;
}

export interface DecoManifest extends Manifest {
  islands: Record<string, Module>;
  components: Record<string, Module>;
  loaders: Record<string, LoaderModule>;
  schemas: Record<string, JSONSchema7>;
}

export interface Site {
  id: number;
  name: string;
}

export interface LiveOptions {
  site: string;
  siteId: number;
  loginUrl?: string;
  domains?: string[];
}

export interface PageComponent {
  // Identifies the component uniquely in the project (e.g: "./components/Header.tsx")
  key: string;
  // Pretty name for the entity
  label: string;
  // Uniquely identifies this entity in the scope of a page (that can have multiple loaders, components)
  uniqueId: string;
  props?: Record<string, unknown>;
}

export interface PageLoader extends PageComponent {
  outputSchema: string;
}

export interface PageData {
  components: PageComponent[];
  loaders: PageLoader[];
}

export interface Page {
  id: number;
  data: PageData;
  name: string;
  path: string;
}

/**
 * This type is used only on the render flow, after we matched an URL path
 * and possibly found page params (e.g: "/:slug/p" with the url "/blouse/p"
 * generates params: { slug: "blouse"})
 */
export interface PageWithParams {
  page: Page;
  params?: Record<string, string>;
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

export interface WithSchema {
  schema?: JSONSchema7;
}

export type AvailableComponent = Omit<PageComponent, "uniqueId"> & WithSchema;
export type AvailableLoader = Omit<PageLoader, "uniqueId"> & WithSchema;

export interface EditorData {
  pageName: string;
  components: Array<PageComponent & WithSchema>;
  loaders: Array<PageLoader & WithSchema>;
  availableComponents: Array<AvailableComponent>;
  availableLoaders: Array<AvailableLoader>;
}
