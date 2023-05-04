// deno-lint-ignore-file no-explicit-any
import { Page } from "$live/blocks/page.ts";
import { isSection, Section } from "$live/blocks/section.ts";
import LiveAnalytics from "$live/components/LiveAnalytics.tsx";
import LiveControls from "$live/components/LiveControls.tsx";
import LivePageEditor, {
  BlockControls,
} from "$live/components/LivePageEditor.tsx";
import { notUndefined } from "$live/engine/core/utils.ts";
import { context } from "$live/live.ts";
import {
  usePageContext,
  useRouterContext,
} from "$live/routes/[...catchall].tsx";
import { CONTENT_SLOT_NAME } from "$live/sections/Slot.tsx";
import { Props as UseSlotProps } from "$live/sections/UseSlot.tsx";
import { ComponentChildren, toChildArray, VNode } from "preact";
import { JSX } from "preact/jsx-runtime";

export interface Props {
  name: string;
  layout?: Page;
  sections: Section[];
}

function renderSectionFor(editMode?: boolean) {
  const Controls = editMode ? BlockControls : () => null;
  return function _renderSection(
    { Component: Section, props, metadata }: Props["sections"][0],
    idx: number,
  ) {
    return (
      <section
        id={`${metadata?.component}-${idx}`}
        data-manifest-key={metadata?.component}
      >
        <Controls metadata={metadata} index={idx} />
        <Section {...props} />
      </section>
    );
  };
}

export const renderSection = renderSectionFor();

interface UseSlotSection {
  // useSection can be either a `UseSlotSection` or a `Section[]` that is outside a slot.
  useSection: (VNode<any> | string | number)[];
  used: boolean;
}

/**
 * Swaps out the `Slot` component by its implementation if available and not used.
 * @param impls the implementation map
 * @returns the section or the slot implementation if available.
 */
const useSlots = (
  impls: Record<string, UseSlotSection>,
) =>
(sec: Section): Section => {
  if (isSection(sec, "$live/sections/Slot.tsx")) {
    const impl = impls[sec.props.name ?? CONTENT_SLOT_NAME];
    if (impl && !impl.used) {
      impl.used = true;
      return { ...sec, props: { ...sec.props, children: impl.useSection } }; // allow content sections to be rendered at current page level.
    }
  }
  return sec;
};

const isUseSlot = (child: ComponentChildren): child is VNode<UseSlotProps> => {
  console.log(child);
  return (child as VNode<UseSlotProps>)?.type === "UseSlot";
};

function indexedBySlotName(
  children: (VNode<any> | string | number)[],
) {
  const indexed: Record<string, UseSlotSection> = {};
  const orphanNodes: (VNode<any> | string | number)[] = [];

  for (const child of children) {
    if (isUseSlot(child)) {
      indexed[child.props.name] = {
        useSection: [child],
        used: false,
      };
    } else {
      orphanNodes.push(child);
    } // others are considered content
  }
  if (orphanNodes.length > 0 && !indexed[CONTENT_SLOT_NAME]) {
    indexed[CONTENT_SLOT_NAME] = {
      used: false,
      useSection: orphanNodes,
    };
  }

  return indexed;
}

/**
 * Recursively builds a page based on its inheritance hierarchy.
 * The algorithm does the following:
 * 0. If there are implementations available, so replace the `Slot.tsx` with the actual implementation for such slot. (useSlots function)
 * 1. If the page has inheritance so the current sections are divded into two groups:
 * 1.1 Per Slot sections: Sections that are inside a UseSlot.tsx section, which are supposed to be used inside a `Slot.tsx` section on its parent.
 * 1.2 Sections that aren't inside a UseSlot.tsx section are considered content and placed inside a `UseSlot.tsx` manually created.
 * After dividing the sections into two groups and create a indexed map, call the function recursively to its parent page.
 * When there's no parent page the algorithm will render the sections based the current @param implementations.
 *
 * At the end of the execution, the algorithm verifies if all `UseSlot.tsx` is used, if not (missing parent free slot), they are rendered at the page bottom.
 * The algorithm is very similar to how we use `Abstract` classes in other languages. So a inherit page is a kind of a class that can have `abstract` methods named `slots`.
 * The child pages can inherit from those classes and implement these methods. The only difference is that we do not fail on an invalid override.
 * @param props the page props
 * @param children the children components
 * @returns the rendered page
 */
function Page(
  { layout, sections: _sections, children: _children, editMode }: Props & {
    children?: ComponentChildren;
    editMode?: boolean;
  },
) {
  const children = _children ? toChildArray(_children) : [];
  // 1. Creates a map [slotName] => child
  const indexedChildren = indexedBySlotName(children);
  // 2. filter undefined sections
  const validSections = _sections.filter(notUndefined);
  // 3. sections.map switch an slot to its implementation on `UseSlot.tsx`
  const sections = Object.keys(indexedChildren).length > 0
    ? validSections.flatMap(useSlots(indexedChildren))
    : validSections;

  const unmatchedSlots = Object.values(indexedChildren).filter((impl) =>
    !impl.used
  );

  const unmatchedSections = unmatchedSlots.flatMap((impl) => impl.useSection);

  const _renderSection = renderSectionFor(editMode);
  if (layout) {
    const { Component: Layout, props } = layout;

    return (
      <>
        <Layout {...props}>
          {sections.map(_renderSection)}
        </Layout>
        {unmatchedSections}
      </>
    );
  }
  const metadata = usePageContext()?.metadata;
  const routerCtx = useRouterContext();

  return (
    <>
      <LiveControls
        site={{ id: context.siteId, name: context.site }}
        page={{
          id: metadata?.id!,
        }}
      />
      <LiveAnalytics
        id={parseInt(metadata?.id ?? "-1")}
        flags={routerCtx?.flags}
        path={routerCtx?.pagePath}
      />
      {sections.map(_renderSection)}
    </>
  );
}

export default function LivePage(
  props: Props,
): JSX.Element {
  return <Page {...props} />;
}

export function Preview(props: Props) {
  const pageCtx = usePageContext();
  const editMode = pageCtx?.url.searchParams.has("editMode") ?? false;

  return (
    <>
      <Page {...props} editMode={editMode}></Page>
      {editMode && <LivePageEditor />}
    </>
  );
}
