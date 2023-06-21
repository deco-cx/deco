import { Head } from "$fresh/runtime.ts";
import { PreactComponent } from "$live/engine/block.ts";
import { JSX } from "preact";

interface PreviewIconProps extends JSX.HTMLAttributes<SVGSVGElement> {
  id:
    | "trash"
    | "chevron-up"
    | "chevron-down"
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
        stroke="currentColor"
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
        stroke="currentColor"
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
        stroke="currentColor"
        fill="none"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <polyline points="6 9 12 15 18 9" />
      </symbol>
      <symbol
        id="copy"
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        stroke-width="1.5"
        stroke="currentColor"
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
        stroke="currentColor"
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
        stroke="currentColor"
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
  /* @deprecated since version @1.3.5 */
  index: number;
  path: string[];
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

function editorController() {
  document.body?.querySelectorAll("[data-event]").forEach((node) => {
    node.addEventListener("click", (e) => {
      e.stopPropagation();

      const event = (node as HTMLElement).dataset.event;

      if (!event) return;

      if (window === top) {
        window.alert("Press `.` to enter edit mode");
      } else {
        const e = JSON.parse(event) as EditorEvent;
        top?.postMessage({ type: "edit", ...e }, "*");
      }
    });
  });
}

export function BlockControls(
  { metadata }: { metadata: PreactComponent["metadata"] },
) {
  const path = metadata?.resolveChain
    .filter((field) => field.type === "prop")
    .map((field) => field.value);

  path?.splice(0, 1); // first is always preview props.

  const index = Number(path?.at(-1) || 0);

  return (
    <div
      data-section-wrapper
      data-event={JSON.stringify({
        action: "edit",
        key: metadata?.component ?? "",
        index,
        path,
      })}
    >
      <div data-insert="">
        <button
          data-insert="prev"
          data-event={JSON.stringify({
            action: "insert",
            key: metadata?.component ?? "",
            index,
            at: index,
            path,
          })}
        >
          <PreviewIcon id="plus" />
        </button>
        <button
          data-insert="next"
          data-event={JSON.stringify({
            action: "insert",
            key: metadata?.component ?? "",
            index,
            at: index + 1,
            path,
          })}
        >
          <PreviewIcon id="plus" />
        </button>
      </div>
      <div data-controllers="">
        <div title={metadata?.component}>
          {beautifyComponentName(metadata?.component)}
        </div>
        <button
          data-delete
          data-tooltip="Delete"
          data-event={JSON.stringify({
            action: "delete",
            key: metadata?.component ?? "",
            index,
            path,
          })}
        >
          <PreviewIcon id="trash" />
        </button>
        <button
          data-tooltip="Move up"
          data-event={JSON.stringify({
            action: "move",
            key: metadata?.component ?? "",
            index,
            from: index,
            to: index - 1,
            path,
          })}
        >
          <PreviewIcon id="chevron-up" />
        </button>
        <button
          data-tooltip="Move down"
          data-event={JSON.stringify({
            action: "move",
            key: metadata?.component ?? "",
            index,
            from: index,
            to: index + 1,
            path,
          })}
        >
          <PreviewIcon id="chevron-down" />
        </button>
        <button
          data-tooltip="Duplicate"
          data-event={JSON.stringify({
            action: "duplicate",
            key: metadata?.component ?? "",
            index,
            path,
          })}
        >
          <PreviewIcon id="copy" />
        </button>
      </div>
    </div>
  );
}

export default function LivePageEditor() {
  return (
    <>
      <Head>
        <style
          id="_live_css"
          dangerouslySetInnerHTML={{
            __html: `
        section[data-manifest-key]:not(:has(section[data-manifest-key])):hover {
           position: relative;
        }

        div[data-section-wrapper] {
          display: none;
          background: rgba(46, 110, 217, 0.2);
          inset: 0;
          position: absolute;
          z-index: 999;

          border: 2px solid;
          border-color: #2E6ED9;
          cursor: pointer; color: white;
        }
        section[data-manifest-key]:not(:has(section[data-manifest-key])):hover div[data-section-wrapper] { display: block;}

        /* controllers */
        div[data-section-wrapper]:hover div[data-controllers] {
          display: flex;
        }

        div[data-controllers] {
          display: none;
          position: absolute;
          right: 18px;
          top: 18px;
          z-index: 999;
          
          background-color: #0A1F1F;
          color: #FFFFFF;

          height: 36px;
          border-radius: 4px;
        }

        div[data-controllers] > div {
          font-style: normal;
          font-weight: 600;
          font-size: 15px;
          padding: 8px 16px;
          max-width: 160px;

          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        /* controllers buttons */
        div[data-section-wrapper] button:focus {
          outline-style: none;
        }

        div[data-controllers] button {
          padding: 8px 12px;
          display: flex;
          align-items: center;
        }
        div[data-controllers] button:hover {
          background-color: #f8f9f514;
        }
        div[data-controllers] button[data-delete]:hover {
          color: #D98470;
        }

        /* controller buttons tooltip */
        div[data-controllers] button[data-tooltip]:hover {
          position: relative;
          --tooltip-tail: 6px;
          --tooltip-offset: calc(100% + 4px + var(--tooltip-tail));
          --tooltip-tail-offset: calc(100% + 4px - var(--tooltip-tail));
          --tooltip-bg-color: #161616;
          --tooltip-color: #ffffff;
        }
        div[data-controllers] button[data-tooltip]:hover:before {
          content: attr(data-tooltip);
          color: var(--tooltip-color);
          background-color: var(--tooltip-bg-color);
          padding: 4px 8px;
          font-weight: 400;
          font-size: 13px;
          line-height: 20px;
          white-space: nowrap;
          border-radius: 4px;
          
          position: absolute;
          top: var(--tooltip-offset);
          left: 50%;
          transform: translateX(-50%);
        }
        div[data-controllers] button:hover:after {
          content: " ";
          border-width: var(--tooltip-tail);
          border-style: solid;
          border-color: transparent transparent var(--tooltip-bg-color) transparent;
          
          position: absolute;
          top: var(--tooltip-tail-offset);
          left: 50%;
          transform: translateX(-50%);
        }

        /* insert buttons */
        div[data-section-wrapper]:hover div[data-insert] {
          display: flex;
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
          z-index: 999;
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
        `,
          }}
        />
        <script
          dangerouslySetInnerHTML={{ __html: `(${editorController})()` }}
        />
      </Head>

      <PreviewIcons />
    </>
  );
}

const beautifyComponentName = (path?: string) =>
  path?.split("/")
    ?.pop()
    ?.split(".")[0];
