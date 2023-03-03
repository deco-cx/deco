import { HandlerContext } from "$fresh/server.ts";
import { MatcherResult } from "$live/blocks/matcher.ts";
import { LiveConfig } from "$live/blocks/types.ts";
import { Resolvable } from "$live/engine/core/resolver.ts";

// TODO Marcos V. Candeia Schema is not considering extends
export interface Audience {
  isActive: MatcherResult;
  state: Record<string, Resolvable>;
}

export default function Audience(
  _req: Request,
  { state: { $live } }: HandlerContext<unknown, LiveConfig<Audience>>,
): Audience {
  return $live;
}
