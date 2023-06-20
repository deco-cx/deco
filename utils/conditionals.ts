import { Matcher } from "$live/blocks/matcher.ts";
import { LoaderContext } from "$live/mod.ts";

export interface Rule<TValue> {
  if: Matcher;
  then: TValue;
}

export interface Props<TValue> {
  rules: Rule<TValue>[];
  else: TValue;
}

export default async function Conditionals<TValue>(
  { rules, else: otherwise }: Props<TValue>,
  req: Request,
  { get }: LoaderContext,
): Promise<TValue> {
  for (
    const { if: _rule, then: _then } of rules
  ) {
    const thenPromise = get(_then);
    const rule = await get(_rule);
    if (rule && typeof rule === "function" && rule({ request: req })) {
      return await thenPromise;
    }
  }
  return get<TValue>(otherwise);
}
