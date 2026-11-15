/**
 * Building blocks for running a deco site on Cloudflare Workers (workerd).
 * See runtime/workerd/README.md.
 */
export {
  type ExecutionContextLike,
  keepCacheWritesAlive,
  runWithExecutionContext,
  waitUntil,
} from "./context.ts";
export { type DenoShimOptions, installDenoShim } from "./deno.ts";
