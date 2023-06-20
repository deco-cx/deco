import { Matcher } from "$live/blocks/matcher.ts";
import { LoaderContext } from "$live/mod.ts";

export interface ResolvedBlock<TBlock> {
  data: TBlock;
  __resolveType: "resolved";
}

export interface Props<TBlock> {
  rule: Matcher;
  block: ResolvedBlock<TBlock>;
}

export type MaybeBlock<TBlock> = TBlock | null;

/**
 * @title Conditional Block Loader
 */
export default async function Maybe<TBlock>(
  { rule, block }: Props<TBlock>,
  req: Request,
  { get }: LoaderContext,
): Promise<MaybeBlock<TBlock>> {
  if (rule && typeof rule === "function" && rule({ request: req })) {
    return await get<TBlock>(block);
  }
  return null;
}
