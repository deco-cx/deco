import { ComponentChildren, createContext, JSX } from "preact";
import { Head } from "$fresh/runtime.ts";
import { PreactComponent } from "$live/engine/block.ts";
import { useContext } from "preact/hooks";

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

function sendEditorEvent(e: Event, args: EditorEvent) {
  e.stopPropagation();
  // TODO: check security issues
  window !== top &&
    top?.postMessage({ type: "edit", ...args }, "*");
}

function useSendEditorEvent(args: EditorEvent) {
  if (!args.key) return {};

  return {
    onclick: `window.LIVE.sendEditorEvent(event, ${JSON.stringify(args)});`,
  };
}

export function BlockControls() {
  const { metadata, index: i, path } = useEditorContext();

  return (
    <div
      data-section-wrapper
      {...useSendEditorEvent({
        action: "edit",
        key: metadata?.component ?? "",
        index: i,
        path,
      })}
    >
      <div data-insert="">
        <button
          data-insert="prev"
          {...useSendEditorEvent({
            action: "insert",
            key: metadata?.component ?? "",
            index: i,
            at: i,
            path,
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
          {...useSendEditorEvent({
            action: "delete",
            key: metadata?.component ?? "",
            index: i,
            path,
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
            path,
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
            path,
          })}
        >
          <PreviewIcon id="chevron-down" />
        </button>
        <button
          {...useSendEditorEvent({
            action: "duplicate",
            key: metadata?.component ?? "",
            index: i,
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
            section[data-manifest-key]:not(:has(section[data-manifest-key])):before {
              content: '';
              display: none;
              position: absolute;
              z-index: 9999;
              inset: 0;

              border: 2px solid;
              border-color: #2E6ED9;
            }

        section[data-manifest-key]:not(:has(section[data-manifest-key])):hover {
          position: relative;
        }

        div[data-section-wrapper] {
          display: none;
          background: rgba(46, 110, 217, 0.2);
          inset: 0;
          position: absolute;
          z-index: 9999;
        }
        section[data-manifest-key]:not(:has(section[data-manifest-key])):hover div[data-section-wrapper] { display: block; cursor: pointer;}

        section[data-manifest-key]:not(:has(section[data-manifest-key])):hover:before,
        section[data-manifest-key]:not(:has(section[data-manifest-key])):hover div[data-controllers],
        section[data-manifest-key]:not(:has(section[data-manifest-key])):hover div[data-insert] {
          display: flex;
        }

        div[data-controllers] {
          display: none;
          position: absolute;
          right: 18px;
          top: 18px;
          z-index: 9999;
          
          background-color: #0A1F1F;
          color: #FFFFFF;

          height: 36px;
          border-radius: 4px;
          overflow: hidden;
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

        section[data-manifest-key] button:focus {
          outline-style: none;
        }

        div[data-controllers] button {
          padding: 8px 12px;
          display: flex;
          align-items: center;
        }

        div[data-controllers] button:hover {
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
          z-index: 9999;
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

interface EditorContextProps {
  metadata: PreactComponent["metadata"];
  index: number;
  path: string[];
}

const EditorContext = createContext<
  EditorContextProps | undefined
>(undefined);

const useEditorContext = () => {
  const ctx = useContext(EditorContext);
  if (ctx === undefined) {
    throw new Error("Something went wrong rendering EditMode");
  }

  return ctx;
};

const useInternalEditorContext = () => useContext(EditorContext);

export function EditorContextProvider(
  { metadata, index, children }: Omit<EditorContextProps, "path"> & {
    children: ComponentChildren;
  },
) {
  const editorCtx = useInternalEditorContext();
  const currentPath = generatePathFromResolveChain(
    metadata!.resolveChain,
    index,
  );
  const path = [...(editorCtx?.path || []), ...currentPath];

  return (
    <EditorContext.Provider
      value={{ metadata, index, path }}
    >
      {children}
    </EditorContext.Provider>
  );
}

const LIVE_PAGE_RESOLVE_TYPE = "$live/pages/LivePage.tsx";
const PAGE_INCLUDE_RESOLVE_TYPE = "$live/sections/PageInclude.tsx";
const USE_SLOT_RESOLVE_TYPE = "$live/sections/UseSlot.tsx";

const isOutsideBlock = (resolve: string) =>
  !resolve.endsWith(".tsx") && !resolve.endsWith("ts");
const isLivePage = (resolve: string) => resolve === LIVE_PAGE_RESOLVE_TYPE;
const isPageInclude = (resolve: string) =>
  resolve === PAGE_INCLUDE_RESOLVE_TYPE;
const isUseSlot = (resolve: string) => resolve === USE_SLOT_RESOLVE_TYPE;

const generatePathFromResolveChain = (
  resolveChain: string[],
  index: number,
) => {
  const nextToLast = resolveChain[resolveChain.length - 2];

  // section inside page layout
  if (
    isLivePage(nextToLast) &&
    resolveChain.length >= 3 &&
    isLivePage(resolveChain[resolveChain.length - 3])
  ) {
    return ["layout", "sections", index.toString()];
  }

  // section inside page include inside layout
  if (
    isLivePage(nextToLast) &&
    resolveChain.length >= 3 &&
    isOutsideBlock(resolveChain[resolveChain.length - 3]) &&
    resolveChain.length >= 4 &&
    isPageInclude(resolveChain[resolveChain.length - 4])
  ) {
    return [];
  }

  // page include inside layout
  if (
    isLivePage(nextToLast) &&
    resolveChain.length >= 4 &&
    isOutsideBlock(resolveChain[resolveChain.length - 3])
  ) {
    return ["layout", "sections", index.toString()];
  }

  // section inside page Section
  if (
    isLivePage(nextToLast) &&
    resolveChain.length >= 3 &&
    !isLivePage(resolveChain[resolveChain.length - 3])
  ) {
    return ["sections", index.toString()];
  }

  // sections inside use slot
  if (isUseSlot(nextToLast)) {
    return ["sections", index.toString()];
  }

  return [index.toString()];
};

const beautifyComponentName = (path?: string) =>
  path?.split("/")
    ?.pop()
    ?.split(".")[0];
