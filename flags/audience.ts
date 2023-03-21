import { Flag } from "$live/blocks/flag.ts";
import { Handler } from "$live/blocks/handler.ts";
import { Matcher } from "$live/blocks/matcher.ts";
import { Resolvable } from "$live/engine/core/resolver.ts";

export interface Audience {
  matcher: Matcher;
  name: string;
  routes: Record<string, Resolvable<Handler>>;
  overrides?: Record<string, string>;
}

export default function Audience({
  matcher,
  routes,
  name,
  overrides,
}: Audience): Flag {
  return { matcher, true: { routes, overrides }, false: {}, name };
}
