/**
 * Deco Fresh Plugins
 *
 * Fresh 2 Integration:
 * Use `decoMiddleware` for Fresh 2's App pattern:
 *
 * ```typescript
 * import { App, staticFiles } from "fresh";
 * import { decoMiddleware } from "deco/runtime/fresh/plugin.tsx";
 *
 * const app = new App()
 *   .use(staticFiles())
 *   .use(await decoMiddleware({ manifest }));
 *
 * if (import.meta.main) {
 *   app.listen();
 * }
 * ```
 *
 * @module
 */

// Re-export Fresh 2 API
export {
  createDecoMiddleware,
  decoMiddleware,
  type DecoFresh2Options,
  type FreshContext,
  type FreshMiddleware,
} from "../runtime/fresh/middleware.tsx";

// Re-export legacy plugin for Fresh 1.x compatibility
export {
  default as decoPlugin,
  type InitOptions,
  type Options,
  type Plugin,
  type PluginMiddleware,
  type PluginRoute,
} from "../runtime/fresh/plugin.tsx";
