import { PageOptions } from "$live/pages.ts";
import { EffectFunction } from "$live/std/types.ts";

export interface Props {
  pageIds: number[];
}

const EffectSelectPage: EffectFunction<Props> = (
  _req,
  _ctx,
  props,
): PageOptions => ({
  selectedPageIds: props.pageIds,
});

export default EffectSelectPage;
