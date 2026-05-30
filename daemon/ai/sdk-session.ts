/**
 * SdkSession — drop-in replacement for PtySession using the Claude Agent SDK.
 *
 * Instead of a PTY, spawns a Node.js subprocess (task-sdk.mjs) that uses
 * @anthropic-ai/claude-agent-sdk. Events arrive as newline-delimited JSON on
 * stdout and are formatted as human-readable text for xterm.js compatibility.
 */

import { join } from "@std/path";

function getGlobalNodeModulesSync(): string {
  try {
    const out = new Deno.Command("npm", {
      args: ["root", "-g"],
      stdout: "piped",
      stderr: "null",
    }).outputSync();
    return new TextDecoder().decode(out.stdout).trim();
  } catch {
    return "";
  }
}

// Computed once at module load — used to resolve globally installed npm packages.
const GLOBAL_NODE_MODULES = getGlobalNodeModulesSync();

const SDK_SCRIPT = join(import.meta.dirname!, "task-sdk.mjs");
const MAX_BUFFER_LINES = 1000;

/** Minimal interface expected by handlers.ts */
export interface SessionLike {
  readonly status: "running" | "exited";
  readonly exitCode: number | null;
  readonly outputBuffer: string[];
  onData(cb: (data: string) => void): () => void;
  onExit(cb: (code: number) => void): () => void;
  write(_data: string): void;
  resize(_cols: number, _rows: number): void;
}

function formatEvent(raw: string): string | null {
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(raw);
  } catch {
    return raw + "\r\n";
  }

  const type = event.type as string;

  switch (type) {
    case "sdk_ready":
      return `\x1b[2m[sdk] session started\x1b[0m\r\n`;

    case "system":
      return `\x1b[2m[system] ${(event.subtype as string) ?? ""}\x1b[0m\r\n`;

    case "assistant": {
      const msg = event.message as {
        content?: Array<{ type: string; text?: string; thinking?: string; name?: string; input?: unknown }>;
      };
      const lines: string[] = [];
      for (const block of msg.content ?? []) {
        if (block.type === "thinking" && block.thinking) {
          lines.push(
            `\x1b[2m[thinking] ${block.thinking.slice(0, 200).replace(/\n/g, " ")}\x1b[0m`,
          );
        } else if (block.type === "text" && block.text) {
          lines.push(`\x1b[97m${block.text}\x1b[0m`);
        } else if (block.type === "tool_use" && block.name) {
          const input = JSON.stringify(block.input ?? {}).slice(0, 120);
          lines.push(`\x1b[33m[tool] ${block.name}\x1b[0m \x1b[2m${input}\x1b[0m`);
        }
      }
      return lines.length ? lines.join("\r\n") + "\r\n" : null;
    }

    case "user": {
      const msg = event.message as {
        content?: Array<{ type: string; tool_use_id?: string; content?: string }>;
      };
      const lines: string[] = [];
      for (const block of msg.content ?? []) {
        if (block.type === "tool_result" && block.content) {
          const preview = String(block.content).slice(0, 300).replace(/\n/g, "\r\n  ");
          lines.push(`\x1b[2m  → ${preview}\x1b[0m`);
        }
      }
      return lines.length ? lines.join("\r\n") + "\r\n" : null;
    }

    case "result": {
      const result = event.result as string ?? "";
      const ms = event.duration_ms as number ?? 0;
      const turns = event.num_turns as number ?? 0;
      const isError = event.is_error as boolean;
      const color = isError ? "\x1b[31m" : "\x1b[32m";
      return (
        `\r\n${color}─────────────────────────────\x1b[0m\r\n` +
        `${result.replace(/\n/g, "\r\n")}\r\n` +
        `\x1b[2m[done] ${turns} turns · ${(ms / 1000).toFixed(1)}s\x1b[0m\r\n`
      );
    }

    case "sdk_error":
      return `\x1b[31m[error] ${event.error}\x1b[0m\r\n`;

    default:
      return null; // skip rate_limit_event, etc.
  }
}

export class SdkSession implements SessionLike {
  readonly outputBuffer: string[] = [];

  #status: "running" | "exited" = "running";
  #exitCode: number | null = null;
  #dataListeners = new Set<(data: string) => void>();
  #exitListeners = new Set<(code: number) => void>();
  #process: Deno.ChildProcess;

  get status() {
    return this.#status;
  }
  get exitCode() {
    return this.#exitCode;
  }

  constructor(opts: {
    prompt: string;
    cwd: string;
    env: Record<string, string>;
  }) {
    // NODE_PATH lets Node find globally installed packages regardless of cwd.
    // In production (Docker), the SDK is installed globally via npm.
    const nodePath = [
      GLOBAL_NODE_MODULES,
      Deno.env.get("NODE_PATH") ?? "",
    ].filter(Boolean).join(":");

    // Use the real HOME so the SDK can find ~/.claude/ credentials.
    // The sandboxed HOME in opts.env is for the Claude agent's file isolation,
    // but the SDK itself needs the real HOME to authenticate.
    const realHome = Deno.env.get("REAL_HOME") ?? Deno.env.get("HOME") ?? "";

    this.#process = new Deno.Command("node", {
      args: [SDK_SCRIPT, opts.prompt],
      cwd: opts.cwd,
      env: { ...opts.env, AGENT_CWD: opts.cwd, NODE_PATH: nodePath, HOME: realHome },
      stdout: "piped",
      stderr: "inherit", // show Node errors directly in daemon logs
    }).spawn();

    this.#readOutput();
    this.#waitForExit();
  }

  async #readOutput() {
    const reader = this.#process.stdout.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const text = formatEvent(line);
          if (!text) continue;
          if (this.outputBuffer.length >= MAX_BUFFER_LINES) {
            this.outputBuffer.shift();
          }
          this.outputBuffer.push(text);
          for (const cb of this.#dataListeners) cb(text);
        }
      }
    } catch {
      // process exited
    } finally {
      reader.releaseLock();
    }
  }

  async #waitForExit() {
    const { code } = await this.#process.status;
    this.#status = "exited";
    this.#exitCode = code;
    for (const cb of this.#exitListeners) cb(code);
  }

  onData(cb: (data: string) => void): () => void {
    this.#dataListeners.add(cb);
    return () => this.#dataListeners.delete(cb);
  }

  onExit(cb: (code: number) => void): () => void {
    this.#exitListeners.add(cb);
    return () => this.#exitListeners.delete(cb);
  }

  /** No-op for SDK mode (non-interactive) */
  write(_data: string): void {}

  /** No-op for SDK mode */
  resize(_cols: number, _rows: number): void {}

  kill() {
    try {
      this.#process.kill("SIGTERM");
    } catch { /* already exited */ }
  }
}
