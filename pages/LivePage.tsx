import { Page } from "$live/blocks/page.ts";
import { isSection, Section } from "$live/blocks/section.ts";
import LiveAnalytics from "$live/components/LiveAnalytics.tsx";
import LiveControls from "$live/components/LiveControls.tsx";
import { notUndefined } from "$live/engine/core/utils.ts";
import { context } from "$live/live.ts";
import {
  usePageContext,
  useRouterContext,
} from "$live/routes/[...catchall].tsx";
import { isLivePageProps } from "$live/sections/PageInclude.tsx";
import { Props as UseSlotProps } from "$live/sections/UseSlot.tsx";
import { JSX } from "preact/jsx-runtime";
import { PreactComponent } from "$live/engine/block.ts";
import { CONTENT_SLOT_NAME } from "$live/sections/Slot.tsx";
import UseSlot from "$live/sections/UseSlot.tsx";
import { Head } from "$fresh/runtime.ts";
import { VNode } from "preact";

export interface Props {
  name: string;
  layout?: Page;
  sections: Section[];
}

export function renderSection(
  props: Props["sections"][0],
  idx: number,
): JSX.Element;
export function renderSection(
  props: Props["sections"][0],
  idx: number,
  controls: VNode | false,
): JSX.Element;
export function renderSection(
  { Component: Section, props, metadata }: Props["sections"][0],
  idx: number,
  controls: VNode | false = false,
) {
  return (
    // data-manifest-key used at preview
    <section
      id={`${metadata?.component}-${idx}`}
      data-manifest-key={metadata?.component}
    >
      {controls}
      <Section {...props} />
    </section>
  );
}

interface UseSlotSection {
  useSlotSection: PreactComponent<JSX.Element, UseSlotProps>;
  used: boolean;
}

/**
 * Builds a map which the key is the name of the slot and the value is the slot component itself.
 * For those sections that aren't used inside a slot it is considered the default `content slot`.
 * @param sections the sections
 * @returns the implementation map.
 */
function indexedBySlotName(
  sections: Section[],
) {
  const indexed: Record<string, UseSlotSection> = {};
  const contentSections: Section[] = [];

  for (const section of sections) {
    if (isSection(section, "$live/sections/UseSlot.tsx")) {
      indexed[section.props.name] = {
        useSlotSection: section,
        used: false,
      };
    } else {
      contentSections.push(section);
    } // others are considered content
  }
  if (contentSections.length > 0) {
    indexed[CONTENT_SLOT_NAME] = {
      used: false,
      useSlotSection: {
        metadata: {
          component: "$live/sections/UseSlot.tsx",
          resolveChain: [],
        },
        Component: UseSlot,
        props: {
          name: CONTENT_SLOT_NAME,
          sections: contentSections,
        },
      },
    };
  }

  return indexed;
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
      return impl.useSlotSection;
    }
  }
  return sec;
};

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
 * @param useSlotsFromChild the indexed implementation of child pages
 * @returns the rendered page
 */
const renderPage = (
  { layout, sections: maybeSections }: Props,
  useSlotsFromChild: Record<string, UseSlotSection> = {},
  preview = false,
): JSX.Element => {
  const validSections = maybeSections.filter(notUndefined);
  const layoutProps = layout?.props;
  const sections = Object.keys(useSlotsFromChild).length > 0
    ? validSections.map(useSlots(useSlotsFromChild))
    : validSections;

  if (layoutProps && isLivePageProps(layoutProps)) {
    const useSlots = indexedBySlotName(
      sections,
    );

    const rendered = renderPage(layoutProps, useSlots, preview);
    // unmatchedSlots are `UseSlot.tsx` that did not find a corresponding `Slot.tsx` with the same name, by default they are rendered at bottom
    const unmatchedSlots = Object.values(useSlots).filter((impl) => !impl.used);
    return (
      <>
        {rendered}
        {unmatchedSlots.map((impl, i) =>
          renderSection(
            impl.useSlotSection,
            i,
            preview && <Controls {...impl.useSlotSection.metadata} index={i} />,
          )
        )}
      </>
    );
  }

  return (
    <>
      {sections.map((d, i) =>
        renderSection(d, i, preview && <Controls {...d} index={i} />)
      )}
    </>
  );
};

export default function LivePage(
  props: Props,
): JSX.Element {
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
      {renderPage(props)}
    </>
  );
}

// Preview site

interface PreviewIconProps extends JSX.HTMLAttributes<SVGSVGElement> {
  id:
    | "trash"
    | "chevron-up"
    | "chevron-down"
    | "components"
    | "copy"
    | "edit"
    | "plus";
}
function PreviewIcon({ id, ...props }: PreviewIconProps) {
  return (
    <svg {...props} width={20} height={20}>
      <use href={`#${id}`} />
    </svg>
  );
}

function PreviewIcons() {
  return (
    <svg style={{ display: "none" }}>
      <symbol
        id="trash"
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        stroke-width="1.5"
        stroke="#ffffff"
        fill="none"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <line x1="4" y1="7" x2="20" y2="7" />
        <line x1="10" y1="11" x2="10" y2="17" />
        <line x1="14" y1="11" x2="14" y2="17" />
        <path d="M5 7l1 12a3 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />
        <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
      </symbol>
      <symbol
        id="chevron-up"
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        stroke-width="1.5"
        stroke="#ffffff"
        fill="none"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <polyline points="6 15 12 9 18 15" />
      </symbol>
      <symbol
        id="chevron-down"
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        stroke-width="1.5"
        stroke="#ffffff"
        fill="none"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <polyline points="6 9 12 15 18 9" />
      </symbol>
      <symbol
        id="components"
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        stroke-width="1.5"
        stroke="#ffffff"
        fill="none"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <path d="M3 12l3 3l3 -3l-3 -3z" />
        <path d="M15 12l3 3l3 -3l-3 -3z" />
        <path d="M9 6l3 3l3 -3l-3 -3z" />
        <path d="M9 18l3 3l3 -3l-3 -3z" />
      </symbol>
      <symbol
        id="copy"
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        stroke-width="1.5"
        stroke="#ffffff"
        fill="none"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <rect x="8" y="8" width="12" height="12" rx="2" />
        <path d="M16 8v-2a2 2 0 0 0 -2 -2h-8a2 2 0 0 0 -2 2v8a2 2 0 0 0 2 2h2" />
      </symbol>
      <symbol
        id="edit"
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        stroke-width="1.5"
        stroke="#ffffff"
        fill="none"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <path d="M9 7h-3a2 2 0 0 0 -2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2 -2v-3" />
        <path d="M9 15h3l8.5 -8.5a1.5 1.5 0 0 0 -3 -3l-8.5 8.5v3" />
        <line x1="16" y1="5" x2="19" y2="8" />
      </symbol>
      <symbol
        id="plus"
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        stroke-width="1.5"
        stroke="#ffffff"
        fill="none"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </symbol>
    </svg>
  );
}

interface DefaultEditorEvent {
  action: "move" | "edit" | "duplicate" | "delete" | "insert";
  key: string;
  index: number;
}

interface MoveEditorEvent extends DefaultEditorEvent {
  action: "move";
  from: number;
  to: number;
}

interface InsertEditorEvent extends DefaultEditorEvent {
  action: "insert";
  at: number;
}

type EditorEvent = DefaultEditorEvent | MoveEditorEvent | InsertEditorEvent;

function sendEditorEvent(args: EditorEvent) {
  // check security issues
  window !== top &&
    top?.postMessage({ type: "edit", ...args }, "*");
}

// function deleteSection(args: DefaultEditorEvent) {
//   const section = document.querySelector(
//     `section[id="${args.key}-${args.index}"]`,
//   );
//
//   section?.parentNode?.removeChild(section);
// }
//
// function moveSection(args: MoveEditorEvent) {
//   const section = document.querySelector(
//     `section[id="${args.key}-${args.index}"]`,
//   );
//
//   if (!section) return;
//
//   if (args.from < args.to && section.nextSibling) {
//     // move down;
//     section?.parentNode?.insertBefore(section.nextSibling, section);
//   } else if (args.from > args.to && section.previousSibling) {
//     // move up
//     section.parentNode?.insertBefore(section, section.previousSibling);
//   }
//   section.scrollIntoView({ behavior: "smooth" });
// }
//
// function duplicateSection(args: EditorEvent) {
//   const section = document.querySelector(
//     `section[id="${args.key}-${args.index}"]`,
//   );
//
//   if (!section) return;
//
//   const newSection = section.cloneNode(true);
//   newSection.id = `${newSection.dataset.manifestKey}-${args.index + 1}`;
//   section?.parentNode?.insertBefore(newSection, section.nextSibling);
// }
//
// function useSendEditorEvent(_args: EditorEvent) {
//   const args = { ..._args };
//   const sendEvent = `sendEditorEvent(${JSON.stringify(args)});`;
//   let extraOp = "";
//
//   if (args.action === "delete") {
//     extraOp = `deleteSection(${JSON.stringify(args)});`;
//   }
//
//   if (args.action === "move") {
//     extraOp = `moveSection(${JSON.stringify(args)})`;
//   }
//
//   if (args.action === "duplicate") {
//     extraOp = `duplicateSection(${JSON.stringify(args)})`;
//   }
//
//   return {
//     onclick: `${sendEvent}${extraOp}`,
//   };
// }

function useSendEditorEvent(args: EditorEvent) {
  if (!args.key) return {};

  return {
    onclick: `window.LIVE.sendEditorEvent(${JSON.stringify(args)});`,
  };
}

interface ControlsProps {
  metadata?: UseSlotSection["useSlotSection"]["metadata"];
  index: number;
}

function Controls({ metadata, index: i }: ControlsProps) {
  return (
    <>
      <div data-insert="">
        <button
          data-insert="prev"
          {...useSendEditorEvent({
            action: "insert",
            key: metadata?.component ?? "",
            index: i,
            at: i,
          })}
        >
          <PreviewIcon id="plus" />
        </button>
        <button
          data-insert="next"
          {...useSendEditorEvent({
            action: "insert",
            key: metadata?.component ?? "",
            index: i,
            at: i + 1,
          })}
        >
          <PreviewIcon id="plus" />
        </button>
      </div>
      <div data-controllers="">
        <div>{metadata?.component}</div>
        <button
          {...useSendEditorEvent({
            action: "delete",
            key: metadata?.component ?? "",
            index: i,
          })}
        >
          <PreviewIcon id="trash" />
        </button>
        <button
          {...useSendEditorEvent({
            action: "move",
            key: metadata?.component ?? "",
            index: i,
            from: i,
            to: i - 1,
          })}
        >
          <PreviewIcon id="chevron-up" />
        </button>
        <button
          {...useSendEditorEvent({
            action: "move",
            key: metadata?.component ?? "",
            index: i,
            from: i,
            to: i + 1,
          })}
        >
          <PreviewIcon id="chevron-down" />
        </button>
        {
          /*
<button>
              <PreviewIcon id="components" />
            </button>
            */
        }
        <button
          {...useSendEditorEvent({
            action: "duplicate",
            key: metadata?.component ?? "",
            index: i,
          })}
        >
          <PreviewIcon id="copy" />
        </button>
        <button
          {...useSendEditorEvent({
            action: "edit",
            key: metadata?.component ?? "",
            index: i,
          })}
        >
          <PreviewIcon id="edit" />
        </button>
      </div>
    </>
  );
}

export function Preview(props: Props) {
  return (
    <>
      {renderPage(props, {}, true)}

      {/* Don't ship it to production */}
      {
        /*
        section[data-manifest-key]:hover {
          position: relative;
          outline-style: solid;
          outline-color: #2E6ED9;
          outline-width: 2px;
          margin-left: 2px;
          margin-right: 2px;
        }
      */
      }
      <Head>
        <style
          id="_live_css"
          dangerouslySetInnerHTML={{
            __html: `
            section[data-manifest-key]:before {
              content: '';
              display: none;
              position: absolute;
              z-index: 1;
              inset: 0;

              border: 2px solid;
              border-color: #2E6ED9;
            }

        section[data-manifest-key]:hover {
          position: relative;
        }

        section[data-manifest-key]:hover:before,
        section[data-manifest-key]:hover div[data-controllers],
        section[data-manifest-key]:hover div[data-insert] {
          display: flex;
        }

        div[data-controllers] {
          display: none;
          position: absolute;
          right: 0;
          z-index: 1;
          
          background-color: #0A1F1F;
          color: #FFFFFF;

          height: 36px;
          border-bottom-left-radius: 4px;
        }

        div[data-controllers] > div {
          font-style: normal;
          font-weight: 600;
          font-size: 15px;
          padding: 8px 16px;
          max-width: 120px;

          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        section[data-manifest-key] button:focus {
          outline-style: none;
        }

        div[data-controllers] button {
          padding: 8px 12px;
          display: flex;
          align-items: center;
        }

        div[data-controllers] button[data-control]:hover {
          background-color: #002525;
        }

        div[data-insert] {
          display: none;
          width: 100%;
        }

        div[data-insert] button {
          background: #2E6ED9;
          padding: 4px;
          box-shadow: 0px 4px 8px rgba(0, 0, 0, 0.25), 0px 8px 32px rgba(0, 0, 0, 0.2);
          border-radius: 9999px;

          position:absolute;
          z-index: 1;
          width: 28px;
          left: 50%;
        }

        div[data-insert] button:first-child {
          transform: translate(-14px, -14px);
        }

        div[data-insert] button:last-child {
          bottom: 0;
          transform: translate(-14px, 14px);
        }

        @media screen and (max-width: 1024px) {
          div[data-insert] button {
            left: calc((100vw - 340px) / 2);
          }
        }
        `,
          }}
        />
      </Head>

      <PreviewIcons />
      <script
        dangerouslySetInnerHTML={{
          __html: `window.LIVE = {
            ...window.LIVE,
            sendEditorEvent: ${sendEditorEvent.toString()}
          };`,
        }}
      />
    </>
  );
}
