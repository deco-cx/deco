import { isSection, Section } from "../blocks/section.ts";

export type WellKnownSlots =
  | "content"
  | "footer"
  | "header"
  | "analytics"
  | "design-system"
  | "SEO";

export interface Props {
  /**
   * @description Enforces the slot to be fulfilled.
   */
  required?: boolean;
  /**
   * @description The name of the slot.
   * @default content
   */
  name?: string | WellKnownSlots;
}

export const CONTENT_SLOT_NAME = "content";
export const isContentSlot = (s: Section): boolean => {
  return isSection(s, "$live/sections/Slot.tsx") &&
    s?.props?.name === CONTENT_SLOT_NAME;
};

export default function Slot(p: Props) {
  if (p?.required) {
    return ShowSlot(p);
  }
  return null;
}

function ShowSlot(p: Props) {
  return (
    <div
      class="border-dashed border-4 border-light-blue-500"
      role="alert"
    >
      <p class="text-center text-2xl">{p.name}</p>
    </div>
  );
}

export const Preview = ShowSlot;
