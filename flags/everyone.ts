import { Flag } from "$live/blocks/flag.ts";
import { Resolvable } from "$live/engine/core/resolver.ts";
import Audience from "$live/flags/audience.ts";
import MatchAlways from "$live/matchers/MatchAlways.ts";

export interface EveryoneConfig {
  state?: Record<string, Resolvable>;
}

export default function Everyone({ state }: EveryoneConfig): Flag {
  return Audience({
    matcher: MatchAlways,
    state: state ?? {},
    name: "Everyone",
  });
}
