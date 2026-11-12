const TRUSTED_EDITOR_ORIGINS_ENV_VAR_NAME = "DECO_EDITOR_TRUSTED_ORIGINS";

/**
 * Origins allowed to drive a rendered page through `postMessage` (the deco
 * admin and studio editors embed sites in an iframe and talk to them this way).
 * `http://localhost` / `http://127.0.0.1` on any port are always allowed for
 * local development. Self-hosted editors can extend the list with a
 * comma-separated `DECO_EDITOR_TRUSTED_ORIGINS`.
 */
const TRUSTED_EDITOR_ORIGINS = [
  "https://admin.deco.cx",
  "https://deco.cx",
  "https://www.deco.cx",
  "https://play.deco.cx",
  "https://admin-cx.deco.page",
  "https://decocms.com",
  "https://www.decocms.com",
  "https://studio.decocms.com",
  "https://studio-stg.decocms.com",
  "https://staging.decocms.com",
  ...(Deno.env.get(TRUSTED_EDITOR_ORIGINS_ENV_VAR_NAME)?.split(",") ?? [])
    .map((origin) => origin.trim())
    .filter(Boolean),
];

export const getTrustedEditorOrigins = (): string[] => TRUSTED_EDITOR_ORIGINS;
