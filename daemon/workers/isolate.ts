import type { LogLine } from "../loggings/stream.ts";

export interface Isolate {
  fetch: (req: Request) => Promise<Response>;
  isRunning?: () => boolean;
  waitUntilReady?: (timeoutMs?: number) => Promise<void>;
  start?: () => void;
  signal?: (sig: Deno.Signal) => void;
  logs?(): AsyncIterableIterator<LogLine> | undefined;
  [Symbol.asyncDispose]?(): PromiseLike<void>;
}

export interface IsolateOptions {
  envVars: { [key: string]: string };
  cwd: string;
  permissions?: Deno.PermissionOptionsObject;
}
