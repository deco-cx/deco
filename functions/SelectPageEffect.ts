import { PageOptions } from "$live/pages.ts";
import { EffectFunction } from "$live/std/types.ts";
import { LiveState } from "$live/types.ts";

export interface Props {
  pageIds: number[];
}

const SelectPageEffect: EffectFunction<Props, LiveState> = (
  _req,
  _ctx,
  props,
): PageOptions => ({
  selectedPageIds: props.pageIds,
});

export default SelectPageEffect;
