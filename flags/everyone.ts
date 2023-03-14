import { Flag } from "$live/blocks/flag.ts";
import { Handler } from "$live/blocks/handler.ts";
import Audience from "$live/flags/audience.ts";
import MatchAlways from "$live/matchers/MatchAlways.ts";

export interface EveryoneConfig {
  routes?: Record<string, Handler>;
  overrides?: Record<string, string>;
}

export default function Everyone({ routes, overrides }: EveryoneConfig): Flag {
  return Audience({
    matcher: MatchAlways,
    routes: routes ?? {},
    overrides,
    name: "Everyone",
  });
}
