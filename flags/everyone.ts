import { HandlerContext } from "$fresh/server.ts";
import { LiveConfig } from "$live/blocks/types.ts";
import { Resolvable } from "$live/engine/core/resolver.ts";
import { Audience } from "$live/flags/audience.ts";

// TODO Marcos V. Candeia Schema is not considering extends
export interface EveryoneConfig {
  state?: Record<string, Resolvable>;
}

export default function Everyone(
  _req: Request,
  { state: { $live } }: HandlerContext<unknown, LiveConfig<EveryoneConfig>>,
): Audience {
  return { state: $live.state ?? {}, isActive: true };
}
