import { FlagObj } from "$live/blocks/flag.ts";
import { Handler } from "$live/blocks/handler.ts";
import { Matcher } from "$live/blocks/matcher.ts";
import { Resolvable } from "$live/engine/core/resolver.ts";

export interface Route {
  pathTemplate: string;
  handler: Resolvable<Handler>;
}
export interface Override {
  use: string;
  insteadOf: string;
}
export interface Audience {
  matcher: Matcher;
  /**
   * @title The audience name (will be used on cookies).
   * @description Add a meaningful short word for the audience name.
   * @maxLength 22
   * @minLength 3
   * @pattern ^[A-Za-z0-9_]+$
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
