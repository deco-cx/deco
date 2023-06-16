import { FlagObj } from "$live/blocks/flag.ts";
import { Handler } from "$live/blocks/handler.ts";
import { Matcher } from "$live/blocks/matcher.ts";
import { Resolvable } from "$live/engine/core/resolver.ts";
import JsonViewer from "../components/JsonViewer.tsx";
import { metabasePreview } from "../utils/metabase.tsx";

/**
 * @titleBy pathTemplate
 */
export interface Route {
  pathTemplate: string;
  /**
   * @description if true so the path will be checked agaisnt the coming from request instead of using urlpattern.
   */
  isHref?: boolean;
  // FIXME this should be placed at nested level 3 of the object to avoid being resolved before the routeSelection is executed.
  handler: { value: Resolvable<Handler> };
}
export interface Override {
  use: string;
  insteadOf: string;
}
/**
 * @titleBy name
 */
export interface Audience {
  matcher: Matcher;
  /**
   * @title The audience name (will be used on cookies).
   * @description Add a meaningful short word for the audience name.
   * @minLength 3
   * @pattern ^[A-Za-z0-9_-]+$
   */
  name: string;
  routes?: Route[];
  overrides?: Override[];
}

/**
 * @title Audience
 * @description Select routes based on the matched audience.
 */
export default function Audience({
  matcher,
  routes,
  name,
  overrides,
}: Audience): FlagObj<Pick<Audience, "routes" | "overrides">> {
  return {
    matcher,
    true: { routes, overrides },
    false: { routes: [], overrides: [] },
    name,
  };
}

export const preview = (result: unknown, ctx: { request: Request }) => {
  const url = new URL(ctx.request.url);
  const metabaseUrl = url.searchParams.get("metabase");
  return metabaseUrl ? metabasePreview(metabaseUrl) : {
    Component: JsonViewer,
    props: { body: JSON.stringify(result, null, 2) },
  };
};
