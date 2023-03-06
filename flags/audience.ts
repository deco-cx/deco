import { Flag } from "$live/blocks/flag.ts";
import { Matcher } from "$live/blocks/matcher.ts";
import { Resolvable } from "$live/engine/core/resolver.ts";

export interface Audience {
  matcher: Matcher;
  name: string;
  state: Record<string, Resolvable>;
}

export default function Audience({ matcher, state, name }: Audience): Flag {
  return { matcher, true: state, false: {}, name };
}
