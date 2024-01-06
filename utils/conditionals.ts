import { Matcher } from "../blocks/matcher.ts";
import { FnProps } from "../blocks/utils.tsx";
import { context } from "../deco.ts";
import { LoaderContext } from "../mod.ts";

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
  ) => Conditionals<TValue>(props[key], req);
};

export default function Conditionals<TValue>(
  _rule: Props<TValue>,
  req: Request,
): TValue {
  const { rules, else: otherwise } = _rule;
  if (!Array.isArray(rules)) return otherwise;
  for (
    const { if: rule, then } of rules
  ) {
    if (
      rule && typeof rule === "function" &&
      rule({ request: req, siteId: context.siteId })
    ) {
      return then;
    }
  }
  return otherwise;
}
