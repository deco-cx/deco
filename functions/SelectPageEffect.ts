import { EffectFunction } from "$live/std/types.ts";
import { LiveState } from "$live/types.ts";

export interface Props {
  pageIds: number[];
}

const SelectPageEffect: EffectFunction<Props, LiveState> = (
  _,
  ctx,
  props,
) => {
  if (!ctx.state.selectedPageIds) {
    ctx.state.selectedPageIds = props.pageIds;
  } else {
    ctx.state.selectedPageIds = ctx.state.selectedPageIds.concat(props.pageIds);
  }
};

export default SelectPageEffect;
