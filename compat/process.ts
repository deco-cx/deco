// compat/process.ts
// Process abstraction (cwd, args, exit, pid)

import type { DecoProcess } from "./types.ts";
import { isDeno } from "./detect.ts";

declare const Deno: {
  cwd(): string;
  args: string[];
  exit(code?: number): never;
  pid: number;
};

const denoProcess: DecoProcess = {
  cwd: () => Deno.cwd(),
  args: () => Deno.args,
  exit: (code) => Deno.exit(code),
  pid: () => Deno.pid,
};

const nodeProcess: DecoProcess = {
  cwd: () => process.cwd(),
  args: () => process.argv.slice(2),
  exit: (code) => process.exit(code),
  pid: () => process.pid,
};

export const proc: DecoProcess = isDeno ? denoProcess : nodeProcess;

