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

const resolveOrReturn = <T>(v: T, get: (v: T) => Promise<T>): Promise<T> => {
  if ((v as { __resolveType: string })?.__resolveType) {
    return get(v);
  }
  return Promise.resolve(v);
};

export default async function Conditionals<TValue>(
  { rules, else: otherwise }: Props<TValue>,
  req: Request,
  { get }: LoaderContext,
): Promise<TValue> {
  for (
    const { if: _rule, then: _then }
      of (await resolveOrReturn(rules ?? [], get))
  ) {
    const [rule, then] = await Promise.all([
      resolveOrReturn(_rule, get),
      Array.isArray(_then)
        ? await Promise.all(_then.map((t) => resolveOrReturn(t, get)))
        : resolveOrReturn(_then, get),
    ]);
    if (rule && typeof rule === "function" && rule({ request: req })) {
      return await get<TValue>(then as TValue);
    }
  }
  return otherwise;
}
