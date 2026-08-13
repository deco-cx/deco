/**
 * Draft preview badge — the always-on "you are viewing a draft" signal.
 *
 * Fast Preview carries the draft pointer in a cookie across in-preview
 * navigation, so after the first click the URL no longer shows `?__draft=` — a
 * reviewer can forget they are looking at unpublished content and mistake it
 * for what is live. This badge floats over the page whenever a draft is bound
 * and offers the two things a reviewer needs: leave preview, or copy a link
 * that hands the exact draft version to someone else.
 *
 * A faithful vanilla port of `@decocms/blocks`'s React `DraftPreviewBadge`:
 * same bottom-left "Preview mode" pill (deco mark + label), same click-to-open
 * popover with "Exit preview" / "Share preview", same colours, paddings and
 * shadows. Injected as a self-contained HTML+JS snippet (no island, no site
 * CSS/Tailwind dependency, inline styles, very high z-index) so it renders the
 * same on any consumer site — the same delivery mechanism as the framework
 * cookie script (see runtime/clientCookies.ts). Only emitted when a draft is
 * active, so it never costs ordinary traffic.
 *
 * Hidden inside an iframe: Studio's own preview surface embeds this exact draft
 * render in an iframe that already has its own chrome, so a second in-frame
 * badge would be redundant clutter. Renders nothing-first and reveals via a
 * client effect only once confirmed unframed — fails closed, never flashes
 * inside Studio's frame.
 */

import { DECO_MARK_DATA_URI } from "./decoMark.ts";

/**
 * Bag key carrying the active draft pointer from `prepareState` to the
 * middleware. A plain `Symbol` (what `createBagKey` produces) — inlined so this
 * client-snippet builder stays free of the heavy `blocks/utils` graph.
 */
export const DRAFT_PREVIEW_KEY: symbol = Symbol("draft-preview");

/** Deco brand palette — dark green text on the lime pill, for contrast. */
const DECO_GREEN = "#0b3d1e";
const DECO_LIME = "#d0ec1a";

/** Escape for safe embedding inside an inline `<script>` (mirrors clientCookies). */
const escapeForScript = (s: string): string =>
  s.replace(/</g, "\\u003c").replace(/>/g, "\\u003e");

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Leaving preview: an arrow back to the published site. */
const EXIT_ICON =
  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" ` +
  `stroke="currentColor" stroke-width="2" stroke-linecap="round" ` +
  `stroke-linejoin="round" aria-hidden="true">` +
  `<path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>`;

/** Sharing the draft: the classic three-node share glyph. */
const SHARE_ICON =
  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" ` +
  `stroke="currentColor" stroke-width="2" stroke-linecap="round" ` +
  `stroke-linejoin="round" aria-hidden="true">` +
  `<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/>` +
  `<circle cx="18" cy="19" r="3"/><path d="M8.59 13.51l6.83 3.98"/>` +
  `<path d="M15.41 6.51l-6.82 3.98"/></svg>`;

const containerStyle = [
  "position:fixed",
  "bottom:16px",
  "left:16px",
  "z-index:2147483647",
  `font-family:${FONT}`,
  "font-size:13px",
  "line-height:1.4",
  "display:none", // revealed by the script only when unframed
].join(";");

const menuStyle = [
  "position:absolute",
  "bottom:calc(100% + 8px)",
  "left:0",
  "min-width:200px",
  "background:#fff",
  "color:#1a1a1a",
  "border-radius:12px",
  "box-shadow:0 8px 30px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.05)",
  "overflow:hidden",
  "display:none", // toggled by the pill
].join(";");

const menuItemStyle = [
  "display:flex",
  "align-items:center",
  "gap:10px",
  "width:100%",
  "text-align:left",
  "padding:10px 14px",
  "background:transparent",
  "border:none",
  "color:inherit",
  "cursor:pointer",
  "font:13px/1.4 inherit",
  "white-space:nowrap",
].join(";");

const iconWrapStyle = `display:inline-flex;flex-shrink:0;color:${DECO_GREEN}`;

const pillStyle = [
  "display:inline-flex",
  "align-items:center",
  "gap:8px",
  "padding:7px 12px 7px 8px",
  `background:${DECO_LIME}`,
  `color:${DECO_GREEN}`,
  "border:none",
  "border-radius:9999px",
  "cursor:pointer",
  "font-size:13px",
  "font-weight:600",
  "box-shadow:0 4px 14px rgba(0,0,0,0.25)",
].join(";");

const menuItem = (attr: string, icon: string, label: string): string =>
  `<button type="button" role="menuitem" ${attr} style="${menuItemStyle}">` +
  `<span style="${iconWrapStyle}">${icon}</span><span data-label>${label}</span>` +
  `</button>`;

/**
 * Build the injectable badge markup for a draft-bound request.
 *
 * `pointer` is the raw `<authority><path>?token=…@<version>` token this render
 * is bound to; it is embedded only into the "share" handler (as a JSON string
 * literal, script-escaped), never interpolated into HTML.
 */
export const buildDraftBadge = (pointer: string): string => {
  const html =
    `<div id="__deco-draft-badge" data-deco-preview-badge style="${containerStyle}">` +
    `<div data-menu role="menu" style="${menuStyle}">` +
    menuItem("data-exit", EXIT_ICON, "Exit preview") +
    `<div style="height:1px;background:rgba(0,0,0,0.07)"></div>` +
    menuItem("data-share", SHARE_ICON, "Share preview") +
    `</div>` +
    `<button type="button" data-toggle aria-expanded="false" ` +
    `aria-label="Preview mode" style="${pillStyle}">` +
    `<img src="${DECO_MARK_DATA_URI}" alt="" width="18" height="18" ` +
    `style="display:block;border-radius:4px"/>` +
    `<span>Preview mode</span>` +
    `</button>` +
    `</div>`;

  // Reveal only once confirmed unframed (fails closed); wire the pill toggle,
  // outside-click / Escape dismissal, exit, and share-link copy.
  const script = `<script>(function(){try{` +
    `if(window.top!==window.self)return;` +
    `var r=document.getElementById("__deco-draft-badge");if(!r)return;` +
    `r.style.display="block";` +
    `var m=r.querySelector("[data-menu]"),t=r.querySelector("[data-toggle]"),o=false;` +
    `function set(v){o=v;m.style.display=v?"block":"none";t.setAttribute("aria-expanded",v?"true":"false");}` +
    `t.addEventListener("click",function(e){e.stopPropagation();set(!o);});` +
    `document.addEventListener("mousedown",function(e){if(o&&!r.contains(e.target))set(false);});` +
    `document.addEventListener("keydown",function(e){if(e.key==="Escape")set(false);});` +
    `var p=${escapeForScript(JSON.stringify(pointer))};` +
    `r.querySelector("[data-exit]").addEventListener("click",function(){` +
    `var u=new URL(location.href);u.searchParams.set("__draft","off");location.href=u.toString();});` +
    `var sh=r.querySelector("[data-share]"),lb=sh.querySelector("[data-label]");` +
    `sh.addEventListener("click",function(){` +
    `var u=new URL(location.href);u.searchParams.set("__draft",p);var link=u.toString();` +
    `(navigator.clipboard?navigator.clipboard.writeText(link):Promise.reject())` +
    `.then(function(){lb.textContent="Copied!";setTimeout(function(){lb.textContent="Share preview";},2000);})` +
    `.catch(function(){window.prompt("Copy preview link:",link);});});` +
    `[].forEach.call(r.querySelectorAll("[role=menuitem]"),function(el){` +
    `el.addEventListener("mouseenter",function(){el.style.background="rgba(0,0,0,0.05)";});` +
    `el.addEventListener("mouseleave",function(){el.style.background="transparent";});});` +
    `}catch(e){}})();</script>`;

  return html + script;
};

/**
 * Inject `snippet` right before the first `</body>` (the badge is body content,
 * not head). Falls back to `</html>`, then to append. Uses `indexOf` (first
 * occurrence) so embedded/nested HTML cannot shift the injection point.
 */
export const injectBeforeBodyEnd = (html: string, snippet: string): string => {
  const idxBody = html.indexOf("</body>");
  if (idxBody >= 0) {
    return html.slice(0, idxBody) + snippet + html.slice(idxBody);
  }
  const idxHtml = html.indexOf("</html>");
  if (idxHtml >= 0) {
    return html.slice(0, idxHtml) + snippet + html.slice(idxHtml);
  }
  return html + snippet;
};
