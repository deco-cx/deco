import { Accounts } from "../blocks/account.ts";
import { Flag } from "../blocks/flag.ts";
import { Loader } from "../blocks/loader.ts";
import { Page } from "../blocks/page.tsx";
import { Section } from "../blocks/section.ts";
import { Resolvable } from "../engine/core/resolver.ts";
import { Apps, LoaderContext } from "../mod.ts";
import { MiddlewareConfig } from "../routes/_middleware.ts";

/**
 * @titleBy key
 */
export interface StateProp {
  key: string;
  value: Accounts | Flag | Section | Loader | Page;
}
export interface Props {
  state: StateProp[];
  apps?: Apps[];
}

/**
 * @title Shared application State Loader.
 * @description Set the application state using resolvables.
 */
export default async function StateLoader(
  { state, apps }: Props,
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
    apps,
  };
}
