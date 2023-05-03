import { Section } from "$live/blocks/section.ts";
import { notUndefined } from "$live/engine/core/utils.ts";
import { renderSectionFor } from "$live/pages/LivePage.tsx";
import { WellKnownSlots } from "$live/sections/Slot.tsx";

export interface Props {
  name: string | WellKnownSlots;
  sections: Section[];
  editMode?: boolean;
}

export default function UseSlot({ sections, editMode }: Props) {
  // TODO: Check performance impact here
  const renderSection = renderSectionFor(editMode);

  return (
    <>
      {(sections ?? []).filter(notUndefined).map(renderSection)}
    </>
  );
}
