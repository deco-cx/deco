import { Matcher } from "$live/blocks/matcher.ts";
import { FnProps } from "$live/blocks/utils.ts";
import { LoaderContext } from "$live/mod.ts";

/**
 * @title Rule
 */
export interface Rule<TValue> {
  if: Matcher;
  then: TValue;
}

export interface Props<TValue> {
  /**
   * @title Rules
   */
  rules: Rule<TValue>[];
  /**
   * @title Otherwise
   * @description Used in case of none of the previous values are used.
   */
  else: TValue;
}

export const withConditionals = <
  TValue,
  T extends { [key in Key]: Props<TValue> },
  Key extends keyof T = keyof T,
>(key: Key): FnProps<T, TValue, LoaderContext> => {
  return (
    props: T,
    req: Request,
    ctx: LoaderContext,
  ) => Conditionals<TValue>(props[key], req, ctx);
};

export default async function Conditionals<TValue>(
  _rule: Props<TValue>,
  req: Request,
  { get }: LoaderContext,
): Promise<TValue> {
  const { rules, else: otherwise } = await get(_rule);
  for (
    const { if: rule, then } of rules
  ) {
    if (rule && typeof rule === "function" && rule({ request: req })) {
      return then;
    }
  }
  return otherwise;
}
