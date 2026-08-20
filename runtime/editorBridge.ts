/**
 * Editor bridge — the in-preview hook that lets Studio drive the visual/CMS
 * editor over a Fast Preview draft render.
 *
 * Fast Preview renders the site's OWN real pages (not the `/live/previews`
 * showcase route) against an unpublished draft. Those real pages do not carry
 * the `<LiveControls>` script the showcase route emits, so Studio's admin frame
 * has no `message` listener to talk to — the hover-to-select overlay silently
 * never activates. This snippet restores that listener on the real page, so the
 * same `postMessage` handshake the sandbox daemon proxy provides also works
 * against a production draft render.
 *
 * Delivery mirrors {@link buildDraftBadge}: a self-contained inline `<script>`
 * injected right before `</body>` by the request middleware, ONLY on a
 * draft-bound request (the pointer is stashed in the bag by `prepareState`, and
 * that only happens for a `?__draft=` from a host the preview allowlist admits
 * — see `engine/decofile/draft.ts`). So it is inert on ordinary traffic exactly
 * like the badge, and upgrading the package alone never turns it on.
 *
 * Two gates keep the `eval` hook safe, because a real page is reachable by URL
 * (unlike the sandbox proxy, whose whole origin is ephemeral and isolated):
 *   1. FRAMED-ONLY — the listener is registered only when the page is embedded
 *      (`window.top !== window.self`). A top-level draft view ("Open in new
 *      tab") has no Studio parent to drive it, so it never exposes the hook.
 *      This is the inverse of the draft badge, which reveals only when unframed.
 *   2. ORIGIN-ALLOWLISTED — the message is evaluated only when `event.origin`
 *      is a known Studio/admin origin ({@link adminDomains}) or a local dev
 *      origin. `frame-ancestors` (see `utils/http.ts`) already bounds WHO may
 *      embed the page; this bounds WHO may inject, closing the
 *      `window.open` + `postMessage` vector that framing alone does not.
 *
 * The injected script is Studio's own overlay (`CMS_EDITOR_SCRIPT` /
 * `visual-editor::activate`); the framework only provides the origin-gated
 * evaluation hook and the `section[data-manifest-key]` markers the overlay
 * reads. The legacy admin `editor::inject` shape is accepted too, so this one
 * listener serves both surfaces.
 */

import { adminDomains } from "../utils/admin.ts";

/**
 * Whether a parent-frame `origin` may inject the editor overlay.
 *
 * `allowed` is the baked Studio/admin origin list. Local dev origins
 * (`localhost`, loopback, `*.localhost`, the native app's `local.studio.decocms.com`)
 * are admitted by shape so a dev Studio on an arbitrary port still works without
 * being hardcoded. Exported for unit testing; the same function is serialised
 * into the injected script via `.toString()`, so it MUST stay self-contained
 * (no module-scope references) to survive `eval` inside the iframe.
 */
export function isEditorParentOriginAllowed(
  origin: string | null | undefined,
  allowed: readonly string[],
): boolean {
  if (!origin) return false;
  if (allowed.indexOf(origin) !== -1) return true;
  try {
    const h = new URL(origin).hostname;
    return (
      h === "localhost" ||
      h === "127.0.0.1" ||
      h.endsWith(".localhost") ||
      h === "local.studio.decocms.com"
    );
  } catch (_e) {
    return false;
  }
}

/**
 * Build the injectable editor-bridge markup for a draft-bound request.
 *
 * No per-request input: the only dynamic value is the static
 * {@link adminDomains} allowlist, embedded as a JSON literal. The origin check
 * is serialised from {@link isEditorParentOriginAllowed} so it is exercised by
 * unit tests rather than duplicated as an untested string.
 */
export const buildEditorBridge = (): string => {
  const allowed = JSON.stringify(adminDomains);
  return (
    `<script>(function(){try{` +
    // Only inside Studio's frame — a top-level draft view has no editor parent.
    `if(window.top===window.self)return;` +
    `var ALLOWED=${allowed};` +
    `var ok=${isEditorParentOriginAllowed.toString()};` +
    `window.addEventListener("message",function(e){try{` +
    `if(!ok(e.origin,ALLOWED))return;` +
    `var d=e.data;if(!d)return;` +
    // Studio/daemon protocol: {type:"visual-editor::activate", script}.
    // Legacy admin protocol: {type:"editor::inject", args:{script}}.
    `var s=(d.type==="visual-editor::activate"||d.type==="editor::inject")` +
    `?(d.script||(d.args&&d.args.script)):null;` +
    `if(!s)return;` +
    `new Function(s)();` +
    `}catch(err){console.error("[deco-editor] injection failed",err);}});` +
    `}catch(e){}})();</script>`
  );
};
