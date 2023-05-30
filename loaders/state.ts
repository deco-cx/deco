import { Resolvable } from "../engine/core/resolver.ts";
import { LoaderContext } from "../mod.ts";
import { MiddlewareConfig } from "../routes/_middleware.ts";

export interface StateProp {
  key: string;
  value: Resolvable;
}
export interface Props {
  state: StateProp[];
}

/**
 * @title Shared application State Loader.
 * @description Set the application state using resolvables.
 */
export default async function StateLoader(
  { state }: Props,
  _req: Request,
  { get }: LoaderContext,
): Promise<MiddlewareConfig> {
  const mState: Promise<[string, Resolvable]>[] = [];

  for (const { key, value } of state) {
    const resolved = get(value).then((resolved) =>
      [key, resolved] as [string, Resolvable]
    );
    mState.push(resolved);
  }

  return {
    state: Object.fromEntries(await Promise.all(mState)),
  };
}
