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
 * Injected as a self-contained HTML+JS snippet (no island, no site CSS/Tailwind
 * dependency, inline styles, very high z-index) so it renders the same on any
 * consumer site — the same delivery mechanism as the framework cookie script
 * (see runtime/clientCookies.ts). Only emitted when a draft is active, so it
 * never costs ordinary traffic.
 *
 * Hidden inside an iframe: Studio's own preview surface embeds this exact draft
 * render in an iframe that already has its own chrome, so a second in-frame
 * badge would be redundant clutter. Renders nothing-first and reveals via a
 * client effect only once confirmed unframed — fails closed, never flashes
 * inside Studio's frame.
 */

/**
 * Bag key carrying the active draft pointer from `prepareState` to the
 * middleware. A plain `Symbol` (what `createBagKey` produces) — inlined so this
 * client-snippet builder stays free of the heavy `blocks/utils` graph.
 */
export const DRAFT_PREVIEW_KEY: symbol = Symbol("draft-preview");

/** Deco brand palette — dark green text on the lime toast, for contrast. */
const DECO_GREEN = "#0b3d1e";
const DECO_LIME = "#d0ec1a";

/** Escape for safe embedding inside an inline `<script>` (mirrors clientCookies). */
const escapeForScript = (s: string): string =>
  s.replace(/</g, "\\u003c").replace(/>/g, "\\u003e");

/** Escape for safe embedding inside an HTML attribute/text node. */
const escapeForHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * Build the injectable badge markup for a draft-bound request.
 *
 * `pointer` is the raw `<authority><path>?token=…@<version>` token this render
 * is bound to; it is embedded only into the "copy link" handler (as a JSON
 * string literal, script-escaped), never interpolated into HTML unescaped.
 */
export const buildDraftBadge = (pointer: string): string => {
  const style = [
    "display:none",
    "position:fixed",
    "bottom:16px",
    "left:50%",
    "transform:translateX(-50%)",
    "z-index:2147483647",
    "align-items:center",
    "gap:10px",
    "padding:8px 14px",
    "border-radius:9999px",
    `background:${DECO_LIME}`,
    `color:${DECO_GREEN}`,
    "font:600 13px/1 ui-sans-serif,system-ui,-apple-system,sans-serif",
    "box-shadow:0 6px 24px rgba(0,0,0,.25)",
    "pointer-events:auto",
  ].join(";");

  const btnStyle =
    `all:unset;cursor:pointer;padding:4px 8px;border-radius:9999px;` +
    `background:${DECO_GREEN};color:${DECO_LIME};font:600 12px/1 inherit`;

  const html =
    `<div id="__deco-draft-badge" role="status" aria-live="polite" style="${
      escapeForHtml(style)
    }">` +
    `<span style="display:inline-flex;align-items:center;gap:6px">` +
    `<span style="width:8px;height:8px;border-radius:9999px;background:${DECO_GREEN};display:inline-block"></span>` +
    `Rascunho</span>` +
    `<button type="button" data-share style="${
      escapeForHtml(btnStyle)
    }">Copiar link</button>` +
    `<a data-exit href="?__draft=off" style="${
      escapeForHtml(btnStyle)
    };text-decoration:none">Sair</a>` +
    `</div>`;

  // Reveal only once confirmed unframed (fails closed); wire the copy-link
  // button to pin the current draft version into a shareable URL.
  const script = `<script>(function(){try{` +
    `if(window.top!==window.self)return;` +
    `var el=document.getElementById("__deco-draft-badge");if(!el)return;` +
    `el.style.display="inline-flex";` +
    `var p=${escapeForScript(JSON.stringify(pointer))};` +
    `var s=el.querySelector("[data-share]");` +
    `s&&s.addEventListener("click",function(){` +
    `var u=new URL(location.href);u.searchParams.set("__draft",p);` +
    `var t=u.toString();` +
    `(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject())` +
    `.then(function(){s.textContent="Copiado!";setTimeout(function(){s.textContent="Copiar link";},1500);})` +
    `.catch(function(){prompt("Copie o link do rascunho:",t);});` +
    `});` +
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
