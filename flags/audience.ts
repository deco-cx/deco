import { FlagObj } from "../blocks/flag.ts";
import { Handler } from "../blocks/handler.ts";
import { Matcher } from "../blocks/matcher.ts";
import JsonViewer from "../components/JsonViewer.tsx";
import { Resolvable } from "../engine/core/resolver.ts";
import { metabasePreview } from "../utils/metabase.tsx";
import Flag from "./flag.ts";
export { onBeforeResolveProps } from "./everyone.ts";
/**
 * @title Site Route
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
  /**
   * @title Priority
   * @description higher priority means that this route will be used in favor of other routes with less or none priority
   */
  highPriority?: boolean;
}
/**
 * @title Routes
 * @description Used to configure your site routes
 */
export type Routes = Route[];
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
  routes?: Routes;
}

/**
 * @title Audience
 * @description Select routes based on the matched audience.
 */
export default function Audience({
  matcher,
  routes,
  name,
}: Audience): FlagObj<Route[]> {
  return Flag<Route[]>({
    matcher,
    true: routes ?? [],
    false: [],
    name,
  });
}

export const preview = (result: unknown, ctx: { request: Request }) => {
  const url = new URL(ctx.request.url);
  const metabaseUrl = url.searchParams.get("metabase");
  return metabaseUrl ? metabasePreview(metabaseUrl) : {
    Component: JsonViewer,
    props: { body: JSON.stringify(result, null, 2) },
  };
};
