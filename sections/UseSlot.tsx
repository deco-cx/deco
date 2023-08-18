import { Section } from "../blocks/section.ts";
import { notUndefined } from "../engine/core/utils.ts";
import { useLivePageContext } from "../pages/LivePage.tsx";
import { WellKnownSlots } from "../sections/Slot.tsx";

export interface Props {
  name: string | WellKnownSlots;
  sections: Section[];
}

export default function UseSlot({ sections }: Props) {
  const { renderSection } = useLivePageContext();

  return (
    <>
      {(sections ?? []).filter(notUndefined).map(renderSection)}
    </>
  );
}
