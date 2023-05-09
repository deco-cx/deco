import Audience, { Override, Route } from "$live/flags/audience.ts";
import MatchAlways from "$live/matchers/MatchAlways.ts";

export interface EveryoneConfig {
  routes?: Route[];
  overrides?: Override[];
}

/**
 * @title Audience Everyone
 * @description Always match regardless of the current user
 */
export default function Everyone({ routes, overrides }: EveryoneConfig) {
  return Audience({
    matcher: MatchAlways,
    routes: routes ?? [],
    overrides,
    name: "Everyone",
  });
}
