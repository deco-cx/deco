import type {
  IslandModule,
  MiddlewareHandlerContext,
} from "$fresh/src/server/types.ts";
import type { Manifest } from "$fresh/server.ts";
import type { JSONSchema7 } from "https://esm.sh/v92/@types/json-schema@7.0.11/X-YS9yZWFjdDpwcmVhY3QvY29tcGF0CmQvcHJlYWN0QDEwLjEwLjY/index.d.ts";
import { createServerTimings } from "$live/utils/timings.ts";
import {
  EffectFunction,
  LoaderFunction,
  MatchFunction,
} from "$live/std/types.ts";

export interface Node {
  label: string;
  fullPath: string;
  editLink?: string;
  children?: Node[];
}

export type Schema = JSONSchema7;

export interface Module extends IslandModule {
  schema?: JSONSchema7;
}

export interface FunctionModule {
  default: LoaderFunction<any, any> | MatchFunction | EffectFunction;
}

export interface DecoManifest extends Manifest {
  islands: Record<string, Module>;
  sections: Record<string, Module>;
  functions: Record<string, FunctionModule>;
  schemas: Record<
    string,
    { inputSchema: JSONSchema7 | null; outputSchema: JSONSchema7 | null }
  >;
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
  inspectPath?: string;
  workbenchPath?: string;
}

export interface PageSection {
  // Identifies the component uniquely in the project (e.g: "./sections/Header.tsx")
  key: string;
  // Pretty name for the entity
  label: string;
  // Uniquely identifies this entity in the scope of a page (that can have multiple functions, sections)
  uniqueId: string;
  props?: Record<string, unknown>;
}

export interface PageFunction extends PageSection {
  outputSchema?: JSONSchema7;
}

export interface PageData {
  sections: PageSection[];
  functions: PageFunction[];
}

export type PageState = "archived" | "draft" | "published" | "dev";

export interface Page {
  id: number;
  data: PageData;
  name: string;
  path: string;
  state: PageState;
  site?: Site;
}

export interface LivePage {
  page: Page;
  flags: Flags;
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

export interface Match {
  // Identifies the MatchFunction uniquely in the project (e.g: "./functions/MatchRandom.ts")
  key: string;
  props?: Record<string, unknown>;
}
export interface Effect {
  // Identifies the EffectFunction uniquely in the project (e.g: "./functions/OverridePageEffect.ts")
  key: string;
  props?: Record<string, unknown>;
}

export interface FlagData {
  matches: Match[];
  effects: Effect[];
}

export type FlagState = "archived" | "draft" | "published";

export interface Flag {
  id: string;
  name: string;
  state: FlagState;
  data: FlagData;
  site: number;
  key: string;
}

export interface Flags {
  [key: string]: true;
}

export type Mode = "edit" | "none";

export interface WithSchema {
  schema?: JSONSchema7;
}

export type AvailableSection = Omit<PageSection, "uniqueId"> & WithSchema;
// We re-add the uniqueId here to allow user to select functions that were already
// added in the page
export type AvailableFunction =
  & Omit<PageFunction, "uniqueId">
  & WithSchema
  & { uniqueId?: string };

export interface EditorData {
  pageName: string;
  sections: Array<PageSection & WithSchema>;
  functions: Array<PageFunction & WithSchema>;
  availableSections: Array<AvailableSection>;
  availableFunctions: Array<AvailableFunction>;
  state: PageState;
}

export type LiveState =
  & {
    site: string;
    t: Omit<ReturnType<typeof createServerTimings>, "printTimings">;
  }
  & WithFlagState
  & WithPageState;

export interface WithFlagState {
  loadFlags: () => Promise<Flag[]> | undefined;
  flags: Flag[];
}

export interface WithPageState {
  loadPage: () => Promise<Page> | undefined;
  page?: Page;
  selectedPageIds: number[];
}

export interface LiveFunctionContext<State = unknown>
  extends MiddlewareHandlerContext<State> {
  params: Record<string, string>;
}
