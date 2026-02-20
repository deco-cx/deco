# Claude Agent Sandbox — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task.

**Goal:** Add general-purpose PTY sessions and Claude Code task management to
sandbox environments, enabling AI agents to work on GitHub issues with auto-PR
and issue reporting.

**Architecture:** Two layers — a generic PTY session manager (`daemon/pty/`)
wrapping `@sigma/pty-ffi`, and a Claude task layer (`daemon/claude/`) that
spawns Claude Code in PTY sessions with lifecycle hooks for GitHub integration.
Endpoints are Hono routes protected by the existing admin JWT auth.

**Tech Stack:** Deno, `@sigma/pty-ffi` (JSR), `@hono/hono`, `gh` CLI, `claude`
CLI

---

### Task 1: Add `@sigma/pty-ffi` dependency

**Files:**

- Modify: `deno.json`

**Step 1: Add the import mapping**

In `deno.json`, add to the `"imports"` object:

```json
"@sigma/pty-ffi": "jsr:@sigma/pty-ffi@^0.39.1"
```

Add it alphabetically after `"@std/testing"`.

**Step 2: Cache the dependency**

Run: `deno cache --unstable-ffi jsr:@sigma/pty-ffi@^0.39.1`

**Step 3: Commit**

```bash
git add deno.json
git commit -m "chore: add @sigma/pty-ffi dependency"
```

---

### Task 2: Create PTY session wrapper (`daemon/pty/session.ts`)

**Files:**

- Create: `daemon/pty/session.ts`

**Step 1: Write `PtySession` class**

This wraps `@sigma/pty-ffi` with an event-driven interface. Key design
decisions:

- `id` is a random string (crypto.randomUUID short prefix)
- `read()` loop runs in background, dispatches to registered callbacks
- `env` is explicitly provided — no inheriting from `Deno.env` to keep secrets
  out
- Exposes `readable` as a `ReadableStream<string>` for flexible consumption
  (WebSocket piping, logging, etc.)

```typescript
import { Pty } from "@sigma/pty-ffi";

export interface PtySessionOptions {
  cmd: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  cols?: number;
  rows?: number;
}

export interface PtySessionInfo {
  id: string;
  status: "running" | "exited";
  exitCode: number | null;
  createdAt: number;
  cmd: string;
}

export class PtySession {
  readonly id: string;
  readonly createdAt: number;
  readonly cmd: string;

  #pty: Pty;
  #status: "running" | "exited" = "running";
  #exitCode: number | null = null;
  #dataCallbacks: Array<(data: string) => void> = [];
  #exitCallbacks: Array<(code: number) => void> = [];
  #readLoop: Promise<void>;
  #outputBuffer: string[] = [];
  #maxBufferLines = 1000;

  get status() {
    return this.#status;
  }

  get exitCode() {
    return this.#exitCode;
  }

  get outputBuffer(): readonly string[] {
    return this.#outputBuffer;
  }

  constructor(opts: PtySessionOptions) {
    this.id = crypto.randomUUID().slice(0, 8);
    this.createdAt = Date.now();
    this.cmd = opts.cmd;

    const cmdWithArgs = opts.args?.length
      ? `${opts.cmd} ${opts.args.join(" ")}`
      : opts.cmd;

    this.#pty = new Pty(cmdWithArgs);

    if (opts.cwd) {
      this.#pty.setWorkingDirectory(opts.cwd);
    }
    if (opts.env) {
      for (const [key, value] of Object.entries(opts.env)) {
        this.#pty.setEnv(key, value);
      }
    }
    if (opts.cols && opts.rows) {
      this.#pty.resize({ width: opts.cols, height: opts.rows });
    }

    this.#readLoop = this.#startReadLoop();
  }

  async #startReadLoop(): Promise<void> {
    try {
      for await (const chunk of this.#pty.read()) {
        const data = typeof chunk === "string" ? chunk : chunk.data;
        this.#pushOutput(data);
        for (const cb of this.#dataCallbacks) {
          cb(data);
        }
      }
    } catch {
      // PTY closed or process exited
    } finally {
      this.#status = "exited";
      this.#exitCode = 0; // @sigma/pty-ffi doesn't expose exit codes directly
      for (const cb of this.#exitCallbacks) {
        cb(this.#exitCode);
      }
    }
  }

  #pushOutput(data: string) {
    this.#outputBuffer.push(data);
    if (this.#outputBuffer.length > this.#maxBufferLines) {
      this.#outputBuffer.shift();
    }
  }

  write(data: string): void {
    this.#pty.write(data);
  }

  resize(cols: number, rows: number): void {
    this.#pty.resize({ width: cols, height: rows });
  }

  kill(): void {
    this.#pty.kill();
  }

  onData(cb: (data: string) => void): void {
    this.#dataCallbacks.push(cb);
  }

  onExit(cb: (code: number) => void): void {
    if (this.#status === "exited") {
      cb(this.#exitCode ?? 0);
      return;
    }
    this.#exitCallbacks.push(cb);
  }

  info(): PtySessionInfo {
    return {
      id: this.id,
      status: this.#status,
      exitCode: this.#exitCode,
      createdAt: this.createdAt,
      cmd: this.cmd,
    };
  }

  async dispose(): Promise<void> {
    if (this.#status === "running") {
      this.kill();
    }
    await this.#readLoop.catch(() => {});
    this.#dataCallbacks = [];
    this.#exitCallbacks = [];
  }
}
```

**Notes for implementer:**

- The `@sigma/pty-ffi` `Pty` constructor takes a command string (not separate
  cmd+args). The args are concatenated.
- `read()` returns an async iterable. The shape of each chunk may vary — handle
  both string and object with `.data` property.
- The library may not expose exit codes directly. We default to 0 when the read
  loop ends. If this becomes an issue later, we can detect non-zero exits via
  output parsing.
- `setEnv` and `setWorkingDirectory` must be called before the process starts
  reading. The Pty constructor may spawn immediately — check `@sigma/pty-ffi`
  docs. If env/cwd must be set before construction, refactor to build options
  before `new Pty()`.

**Step 2: Commit**

```bash
git add daemon/pty/session.ts
git commit -m "feat(daemon): add PtySession wrapper over @sigma/pty-ffi"
```

---

### Task 3: Create PTY session manager (`daemon/pty/manager.ts`)

**Files:**

- Create: `daemon/pty/manager.ts`

**Step 1: Write `SessionManager` class**

```typescript
import {
  PtySession,
  type PtySessionInfo,
  type PtySessionOptions,
} from "./session.ts";

export class SessionManager {
  #sessions = new Map<string, PtySession>();

  spawn(opts: PtySessionOptions): PtySession {
    const session = new PtySession(opts);
    this.#sessions.set(session.id, session);

    session.onExit(() => {
      // Keep exited sessions for status queries; cleanup on explicit kill or dispose
    });

    return session;
  }

  get(id: string): PtySession | undefined {
    return this.#sessions.get(id);
  }

  kill(id: string): boolean {
    const session = this.#sessions.get(id);
    if (!session) return false;
    session.kill();
    this.#sessions.delete(id);
    return true;
  }

  list(): PtySessionInfo[] {
    return Array.from(this.#sessions.values()).map((s) => s.info());
  }

  async dispose(): Promise<void> {
    const promises = Array.from(this.#sessions.values()).map((s) =>
      s.dispose()
    );
    await Promise.allSettled(promises);
    this.#sessions.clear();
  }
}
```

**Step 2: Commit**

```bash
git add daemon/pty/manager.ts
git commit -m "feat(daemon): add PTY SessionManager"
```

---

### Task 4: Create GitHub integration (`daemon/claude/github.ts`)

**Files:**

- Create: `daemon/claude/github.ts`

**Step 1: Write GitHub helper functions**

All GitHub operations use the `gh` CLI (installed in the Docker image). We run
them via `Deno.Command`. The `GITHUB_TOKEN` env var is passed explicitly to each
command — not inherited from the process env.

```typescript
export interface IssueContext {
  owner: string;
  repo: string;
  number: number;
  title: string;
  body: string;
  labels: string[];
  comments: Array<{ author: string; body: string }>;
}

/**
 * Parse a GitHub issue URL into owner/repo/number.
 * Supports: https://github.com/owner/repo/issues/123
 */
export function parseIssueUrl(
  url: string,
): { owner: string; repo: string; number: number } {
  const match = url.match(
    /github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/,
  );
  if (!match) {
    throw new Error(`Invalid GitHub issue URL: ${url}`);
  }
  return { owner: match[1], repo: match[2], number: parseInt(match[3], 10) };
}

/**
 * Fetch issue details using gh CLI.
 */
export async function fetchIssue(
  url: string,
  token: string,
): Promise<IssueContext> {
  const { owner, repo, number } = parseIssueUrl(url);
  const nwo = `${owner}/${repo}`;

  // Fetch issue details
  const issueCmd = new Deno.Command("gh", {
    args: [
      "issue",
      "view",
      `${number}`,
      "--repo",
      nwo,
      "--json",
      "title,body,labels,comments",
    ],
    stdout: "piped",
    stderr: "piped",
    env: { GITHUB_TOKEN: token, PATH: Deno.env.get("PATH") ?? "" },
  });

  const issueOutput = await issueCmd.output();
  if (!issueOutput.success) {
    const stderr = new TextDecoder().decode(issueOutput.stderr);
    throw new Error(`gh issue view failed: ${stderr}`);
  }

  const data = JSON.parse(new TextDecoder().decode(issueOutput.stdout));

  return {
    owner,
    repo,
    number,
    title: data.title ?? "",
    body: data.body ?? "",
    labels: (data.labels ?? []).map((l: { name: string }) => l.name),
    comments: (data.comments ?? []).map(
      (c: { author: { login: string }; body: string }) => ({
        author: c.author?.login ?? "unknown",
        body: c.body ?? "",
      }),
    ),
  };
}

/**
 * Build a Claude prompt from an issue context.
 */
export function buildPromptFromIssue(issue: IssueContext): string {
  const commentsSection = issue.comments.length > 0
    ? issue.comments
      .map((c) => `### Comment by @${c.author}:\n${c.body}`)
      .join("\n\n")
    : "No comments on this issue.";

  return `# Task: GitHub Issue https://github.com/${issue.owner}/${issue.repo}/issues/${issue.number}

## Title
${issue.title}

## Labels
${issue.labels.join(", ") || "none"}

## Description
${issue.body}

## Discussion
${commentsSection}

---

## Instructions

You are an autonomous coding agent. Implement a solution for the GitHub issue above.

Guidelines:
1. Read and understand the issue thoroughly before making changes
2. Follow the existing code style and conventions
3. Make focused, minimal changes that address the issue
4. Add or update tests if applicable
5. Ensure your changes don't break existing functionality
6. Commit your changes with a descriptive message

Begin implementing the solution now.`;
}

export interface CreatePROptions {
  owner: string;
  repo: string;
  issueNumber: number;
  issueTitle: string;
  branch: string;
  token: string;
  cwd: string;
}

/**
 * Create a pull request referencing the issue.
 */
export async function createPR(
  opts: CreatePROptions,
): Promise<string | null> {
  const nwo = `${opts.owner}/${opts.repo}`;
  const title = `Fixes #${opts.issueNumber}: ${opts.issueTitle}`;
  const body = `## Summary

Automated implementation for #${opts.issueNumber}.

## Issue Reference
https://github.com/${nwo}/issues/${opts.issueNumber}

---
*Created automatically by deco sandbox agent.*`;

  const cmd = new Deno.Command("gh", {
    args: [
      "pr",
      "create",
      "--repo",
      nwo,
      "--title",
      title,
      "--body",
      body,
    ],
    stdout: "piped",
    stderr: "piped",
    cwd: opts.cwd,
    env: { GITHUB_TOKEN: opts.token, PATH: Deno.env.get("PATH") ?? "" },
  });

  const output = await cmd.output();
  const stdout = new TextDecoder().decode(output.stdout).trim();

  if (!output.success) {
    const stderr = new TextDecoder().decode(output.stderr);
    console.error(`[claude] gh pr create failed: ${stderr}`);
    return null;
  }

  // gh pr create outputs the PR URL
  const prUrlMatch = stdout.match(
    /https:\/\/github\.com\/[^\s]+\/pull\/\d+/,
  );
  return prUrlMatch ? prUrlMatch[0] : stdout;
}

/**
 * Post a completion comment on the issue.
 */
export async function commentOnIssue(
  opts: {
    owner: string;
    repo: string;
    issueNumber: number;
    prUrl: string | null;
    success: boolean;
    token: string;
  },
): Promise<void> {
  const nwo = `${opts.owner}/${opts.repo}`;
  const statusEmoji = opts.success ? ":white_check_mark:" : ":warning:";
  const statusText = opts.success
    ? "completed successfully"
    : "completed with warnings";

  const body = `## :robot: Agent Report

**Status:** ${statusEmoji} Task ${statusText}

### Pull Request
${opts.prUrl ?? "No PR created"}

---
*Automated by deco sandbox agent.*`;

  const cmd = new Deno.Command("gh", {
    args: [
      "issue",
      "comment",
      `${opts.issueNumber}`,
      "--repo",
      nwo,
      "--body",
      body,
    ],
    stdout: "piped",
    stderr: "piped",
    env: { GITHUB_TOKEN: opts.token, PATH: Deno.env.get("PATH") ?? "" },
  });

  const output = await cmd.output();
  if (!output.success) {
    const stderr = new TextDecoder().decode(output.stderr);
    console.error(`[claude] gh issue comment failed: ${stderr}`);
  }
}
```

**Step 2: Commit**

```bash
git add daemon/claude/github.ts
git commit -m "feat(daemon): add GitHub integration for Claude tasks (issue fetch, PR, comments)"
```

---

### Task 5: Create Claude task manager (`daemon/claude/task.ts`)

**Files:**

- Create: `daemon/claude/task.ts`

**Step 1: Write `ClaudeTask` class**

A `ClaudeTask` wraps a `PtySession`. It spawns Claude Code, captures output, and
on exit runs the GitHub completion flow (create PR, post comment).

```typescript
import { PtySession } from "../pty/session.ts";
import {
  buildPromptFromIssue,
  commentOnIssue,
  createPR,
  fetchIssue,
  type IssueContext,
  parseIssueUrl,
} from "./github.ts";

export interface ClaudeTaskOptions {
  /** GitHub issue URL — mutually exclusive with `prompt`. */
  issue?: string;
  /** Inline prompt — mutually exclusive with `issue`. */
  prompt?: string;
  /** Working directory (the cloned repo). */
  cwd: string;
  /** ANTHROPIC_API_KEY — injected into Claude's env only. */
  anthropicApiKey: string;
  /** GITHUB_TOKEN — injected into Claude's and gh's env only. */
  githubToken?: string;
  /** Extra env vars for the Claude process. */
  extraEnv?: Record<string, string>;
}

export type ClaudeTaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed";

export interface ClaudeTaskInfo {
  taskId: string;
  status: ClaudeTaskStatus;
  issue?: string;
  prompt?: string;
  prUrl?: string | null;
  createdAt: number;
}

export class ClaudeTask {
  readonly taskId: string;
  readonly createdAt: number;
  readonly issue?: string;
  readonly prompt?: string;

  #session: PtySession | null = null;
  #status: ClaudeTaskStatus = "pending";
  #prUrl: string | null = null;
  #issueCtx: IssueContext | null = null;
  #opts: ClaudeTaskOptions;

  get status() {
    return this.#status;
  }

  get session() {
    return this.#session;
  }

  constructor(opts: ClaudeTaskOptions) {
    if (!opts.issue && !opts.prompt) {
      throw new Error("Either 'issue' or 'prompt' is required");
    }
    this.taskId = `t_${crypto.randomUUID().slice(0, 8)}`;
    this.createdAt = Date.now();
    this.issue = opts.issue;
    this.prompt = opts.prompt;
    this.#opts = opts;
  }

  async start(): Promise<void> {
    this.#status = "running";

    // Build the prompt
    let claudePrompt: string;
    if (this.#opts.issue) {
      if (!this.#opts.githubToken) {
        throw new Error("GITHUB_TOKEN required for issue-based tasks");
      }
      this.#issueCtx = await fetchIssue(
        this.#opts.issue,
        this.#opts.githubToken,
      );
      claudePrompt = buildPromptFromIssue(this.#issueCtx);
    } else {
      claudePrompt = this.#opts.prompt!;
    }

    // Build env for the Claude child process — secrets go here, NOT in shell
    const env: Record<string, string> = {
      ANTHROPIC_API_KEY: this.#opts.anthropicApiKey,
      HOME: Deno.env.get("HOME") ?? "/home/deno",
      PATH: Deno.env.get("PATH") ?? "",
      ...this.#opts.extraEnv,
    };
    if (this.#opts.githubToken) {
      env.GITHUB_TOKEN = this.#opts.githubToken;
    }

    this.#session = new PtySession({
      cmd: "claude",
      args: ["--print", "--dangerously-skip-permissions", claudePrompt],
      env,
      cwd: this.#opts.cwd,
    });

    this.#session.onExit((code) => {
      this.#onComplete(code).catch((err) => {
        console.error(`[claude] Post-completion failed:`, err);
      });
    });
  }

  async #onComplete(exitCode: number): Promise<void> {
    const success = exitCode === 0;
    this.#status = success ? "completed" : "failed";

    console.log(
      `[claude] Task ${this.taskId} exited with code ${exitCode}`,
    );

    // Only run GitHub flow if this was an issue-based task
    if (!this.#issueCtx || !this.#opts.githubToken) return;

    const { owner, repo, number: issueNumber, title } = this.#issueCtx;

    // Get current branch
    const branchCmd = new Deno.Command("git", {
      args: ["rev-parse", "--abbrev-ref", "HEAD"],
      cwd: this.#opts.cwd,
      stdout: "piped",
    });
    const branchOutput = await branchCmd.output();
    const branch = new TextDecoder().decode(branchOutput.stdout).trim();

    // Check if there are any commits to push
    const diffCmd = new Deno.Command("git", {
      args: ["diff", "--stat", "HEAD~1"],
      cwd: this.#opts.cwd,
      stdout: "piped",
    });
    const diffOutput = await diffCmd.output();
    const hasDiff =
      new TextDecoder().decode(diffOutput.stdout).trim().length > 0;

    if (!hasDiff) {
      console.log(`[claude] No changes to create PR for task ${this.taskId}`);
      await commentOnIssue({
        owner,
        repo,
        issueNumber,
        prUrl: null,
        success: false,
        token: this.#opts.githubToken,
      });
      return;
    }

    // Push the branch
    const pushCmd = new Deno.Command("git", {
      args: ["push", "-u", "origin", branch],
      cwd: this.#opts.cwd,
      stdout: "piped",
      stderr: "piped",
      env: {
        GITHUB_TOKEN: this.#opts.githubToken,
        PATH: Deno.env.get("PATH") ?? "",
      },
    });
    await pushCmd.output();

    // Create PR
    this.#prUrl = await createPR({
      owner,
      repo,
      issueNumber,
      issueTitle: title,
      branch,
      token: this.#opts.githubToken,
      cwd: this.#opts.cwd,
    });

    console.log(
      `[claude] PR created for task ${this.taskId}: ${this.#prUrl}`,
    );

    // Comment on issue
    await commentOnIssue({
      owner,
      repo,
      issueNumber,
      prUrl: this.#prUrl,
      success,
      token: this.#opts.githubToken,
    });
  }

  info(): ClaudeTaskInfo {
    return {
      taskId: this.taskId,
      status: this.#status,
      issue: this.issue,
      prompt: this.prompt,
      prUrl: this.#prUrl,
      createdAt: this.createdAt,
    };
  }

  async dispose(): Promise<void> {
    if (this.#session) {
      await this.#session.dispose();
    }
  }
}
```

**Step 2: Commit**

```bash
git add daemon/claude/task.ts
git commit -m "feat(daemon): add ClaudeTask manager with GitHub lifecycle"
```

---

### Task 6: Create Hono route handlers (`daemon/claude/handlers.ts`)

**Files:**

- Create: `daemon/claude/handlers.ts`

**Step 1: Write route handlers**

This creates a Hono app with all `/sandbox/tasks` routes. Auth is applied by the
caller (in `main.ts`) since these routes are mounted under the sandbox section
which already has auth.

```typescript
import { Hono } from "@hono/hono";
import { ClaudeTask } from "./task.ts";

interface ClaudeHandlersOptions {
  /** Working directory for Claude (the cloned repo). */
  cwd: string;
  /** ANTHROPIC_API_KEY from daemon env. */
  anthropicApiKey: string;
  /** GITHUB_TOKEN from daemon env. */
  githubToken?: string;
  /** Extra env vars from deploy request. */
  extraEnv?: Record<string, string>;
}

export const createClaudeHandlers = (opts: ClaudeHandlersOptions) => {
  const app = new Hono();
  const tasks = new Map<string, ClaudeTask>();

  // POST /sandbox/tasks — create a new Claude task
  app.post("/", async (c) => {
    let body: { issue?: string; prompt?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const { issue, prompt } = body;

    if (!issue && !prompt) {
      return c.json(
        { error: "Either 'issue' or 'prompt' is required" },
        400,
      );
    }

    if (issue && typeof issue !== "string") {
      return c.json({ error: "'issue' must be a string" }, 400);
    }

    if (prompt && typeof prompt !== "string") {
      return c.json({ error: "'prompt' must be a string" }, 400);
    }

    const task = new ClaudeTask({
      issue,
      prompt,
      cwd: opts.cwd,
      anthropicApiKey: opts.anthropicApiKey,
      githubToken: opts.githubToken,
      extraEnv: opts.extraEnv,
    });

    tasks.set(task.taskId, task);

    try {
      await task.start();
    } catch (err) {
      tasks.delete(task.taskId);
      console.error(`[claude] Failed to start task:`, err);
      return c.json({ error: "Failed to start task" }, 500);
    }

    console.log(
      `[claude] Task ${task.taskId} started${
        issue ? ` for issue: ${issue}` : ""
      }`,
    );

    return c.json({
      taskId: task.taskId,
      status: task.status,
    }, 201);
  });

  // GET /sandbox/tasks — list all tasks
  app.get("/", (c) => {
    const list = Array.from(tasks.values()).map((t) => t.info());
    return c.json(list);
  });

  // GET /sandbox/tasks/:taskId — get task details
  app.get("/:taskId", (c) => {
    const task = tasks.get(c.req.param("taskId"));
    if (!task) {
      return c.json({ error: "Task not found" }, 404);
    }
    return c.json(task.info());
  });

  // GET /sandbox/tasks/:taskId/ws — WebSocket PTY attach
  app.get("/:taskId/ws", (c) => {
    const task = tasks.get(c.req.param("taskId"));
    if (!task) {
      return c.json({ error: "Task not found" }, 404);
    }

    const session = task.session;
    if (!session) {
      return c.json({ error: "Task has no active session" }, 400);
    }

    const { socket, response } = Deno.upgradeWebSocket(c.req.raw);

    socket.onopen = () => {
      // Send buffered output
      for (const line of session.outputBuffer) {
        socket.send(line);
      }

      // Stream new output
      session.onData((data) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(data);
        }
      });

      // Notify on exit
      session.onExit((code) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "exit", code }));
          socket.close();
        }
      });
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "input" && typeof msg.data === "string") {
          session.write(msg.data);
        } else if (
          msg.type === "resize" && typeof msg.cols === "number" &&
          typeof msg.rows === "number"
        ) {
          session.resize(msg.cols, msg.rows);
        }
      } catch {
        // Ignore malformed messages
      }
    };

    socket.onclose = () => {
      // Don't kill the session on disconnect — Claude keeps running
    };

    return response;
  });

  // DELETE /sandbox/tasks/:taskId — kill a task
  app.delete("/:taskId", async (c) => {
    const taskId = c.req.param("taskId");
    const task = tasks.get(taskId);
    if (!task) {
      return c.json({ error: "Task not found" }, 404);
    }

    await task.dispose();
    tasks.delete(taskId);

    console.log(`[claude] Task ${taskId} killed`);
    return c.json({ ok: true });
  });

  // Dispose all tasks (for undeploy)
  const dispose = async () => {
    for (const task of tasks.values()) {
      await task.dispose();
    }
    tasks.clear();
  };

  return { app, dispose };
};
```

**Step 2: Commit**

```bash
git add daemon/claude/handlers.ts
git commit -m "feat(daemon): add Claude task HTTP/WebSocket handlers"
```

---

### Task 7: Wire into sandbox mode (`daemon/main.ts` + `daemon/sandbox.ts`)

**Files:**

- Modify: `daemon/sandbox.ts`
- Modify: `daemon/main.ts`

**Step 1: Update `DeployParams` in `daemon/sandbox.ts`**

Add the optional `task` and `branch` fields to `DeployParams`:

```typescript
interface DeployParams {
  repo?: string;
  /** Always resolved: either from the request body or derived from `repo`. */
  site: string;
  envName?: string;
  branch?: string;
  runCommand?: string[];
  envs?: Record<string, string>;
  task?: { issue?: string; prompt?: string };
}
```

Also update the request body type in the `deploy` handler to include `task` and
`branch`:

```typescript
let body: {
  repo?: string;
  site?: string;
  envName?: string;
  branch?: string;
  runCommand?: string[];
  envs?: Record<string, string>;
  task?: { issue?: string; prompt?: string };
};
```

Add validation for `branch`:

```typescript
if (body.branch !== undefined && typeof body.branch !== "string") {
  return c.json({ error: "branch must be a string" }, 400);
}
```

Pass `task` and `branch` through to `onDeploy`:

```typescript
result = await onDeploy({
  repo,
  site,
  envName,
  branch: body.branch,
  runCommand,
  envs,
  task: body.task,
});
```

**Step 2: Update `main.ts` to mount Claude handlers**

In the sandbox mode section of `main.ts`, after `createSiteApp`, set up Claude
handlers:

```typescript
import { createClaudeHandlers } from "./claude/handlers.ts";

// Inside the sandbox block, after currentSite is created in onDeploy:

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const GITHUB_TOKEN_ENV = Deno.env.get("GITHUB_TOKEN");

// ... inside onDeploy callback, after currentSite = createSiteApp(...):

let claudeHandlers: ReturnType<typeof createClaudeHandlers> | null = null;

// If Claude is available, set up task handlers
if (ANTHROPIC_API_KEY) {
  claudeHandlers = createClaudeHandlers({
    cwd: Deno.cwd(),
    anthropicApiKey: ANTHROPIC_API_KEY,
    githubToken: GITHUB_TOKEN_ENV ?? envs?.GITHUB_TOKEN,
    extraEnv: envs,
  });
}

// If deploy included a task, auto-start it
if (task && claudeHandlers) {
  // Fire and forget — task runs in background
  const taskResponse = await claudeHandlers.app.request(
    new Request("http://localhost/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(task),
    }),
  );
  const taskResult = await taskResponse.json();
  console.log(`[sandbox] Auto-started Claude task: ${taskResult.taskId}`);
}
```

Also thread the `branch` parameter through to `createSiteApp` → `createDeps` →
`ensureGit`:

- Add `branch?: string` to `SiteAppOptions`
- Pass `branch` to `createDeps(ac.signal, { repoUrl: repo, branch })`
- In `createDeps`, pass `branch` to
  `ensureGit({ site: siteName, repoUrl: opts?.repoUrl, branch: opts?.branch })`
- In `ensureGit` (`daemon/git.ts`), accept `branch?: string` and use it as the
  `--branch` arg in `git.clone()` instead of `DEFAULT_TRACKING_BRANCH` when
  provided. Also after clone, checkout a new branch if it doesn't exist:
  `git checkout -b <branch>` or `git checkout <branch>`.

Mount the routes (in the sandbox mode block, alongside other sandbox routes):

```typescript
// After app.delete("/sandbox/deploy", sandbox.undeploy):
app.route("/sandbox/tasks", {
  fetch: (req: Request) => {
    if (!claudeHandlers) {
      return new Response(
        JSON.stringify({
          error: "Claude not configured (ANTHROPIC_API_KEY not set)",
        }),
        { status: 503, headers: { "content-type": "application/json" } },
      );
    }
    return claudeHandlers.app.fetch(req);
  },
});
```

Add Claude handler cleanup to `onUndeploy`:

```typescript
onUndeploy: async () => {
  if (claudeHandlers) {
    await claudeHandlers.dispose();
    claudeHandlers = null;
  }
  // ... existing cleanup
},
```

**Notes for implementer:**

- The `claudeHandlers` variable needs to be in the same scope as `currentSite`
  (the sandbox closure in `main.ts`).
- Auth is already handled by the daemon API middleware for these routes. The
  `/sandbox/tasks` routes sit under the sandbox mode block which doesn't go
  through `createDaemonAPIs` auth — you need to add auth explicitly. Use the
  existing `createAuth` middleware from `daemon/auth.ts`. Wrap the Claude
  routes:

```typescript
import { createAuth } from "./auth.ts";

// When mounting:
app.use("/sandbox/tasks/*", createAuth({ site: getSiteName() ?? "" }));
app.route("/sandbox/tasks", claudeHandlersApp);
```

**Step 3: Commit**

```bash
git add daemon/sandbox.ts daemon/main.ts
git commit -m "feat(daemon): wire Claude tasks into sandbox mode"
```

---

### Task 8: Update Dockerfile in CI workflow

**Files:**

- Modify: `.github/workflows/publish.yaml`

**Step 1: Add Node.js, gh CLI, and Claude Code to both Dockerfile templates**

In the inline Dockerfile for the **first image** (lines 79-96), add the
following lines **before** `USER deno`:

```dockerfile
RUN apk add git openssh curl jq nodejs npm
RUN apk add --no-cache github-cli
RUN npm install -g @anthropic-ai/claude-code
```

Replace the existing `RUN apk add git openssh` line.

Do the same for the **second image** (lines 130-151).

The full Dockerfile for the first image becomes:

```dockerfile
FROM denoland/deno:alpine-1.44.4

EXPOSE 8000

WORKDIR /app

RUN apk add git openssh curl jq nodejs npm
RUN apk add --no-cache github-cli
RUN npm install -g @anthropic-ai/claude-code
RUN DENO_DIR=/daemon-deno-dir deno cache jsr:@deco/deco@$IMAGE_TAG_COMMIT/scripts/run
RUN mkdir -p /home/deno && chown -R deno:deno /home/deno && mkdir /app/deco && chown -R deno:deno /app && mkdir -p /deno-dir && chown -R deno:deno /deno-dir && chown -R deno:deno /daemon-deno-dir

USER deno

WORKDIR /app/deco
```

**Notes for implementer:**

- `github-cli` is in Alpine's community repo. If the base image doesn't have
  community enabled, you may need:
  `RUN apk add --no-cache --repository=https://dl-cdn.alpinelinux.org/alpine/edge/community github-cli`
- `npm install -g` runs as root (before `USER deno`), which is correct — the
  binary lands in `/usr/local/bin/`
- Claude Code requires `HOME` to be writable. The `deno` user already has
  `/home/deno` created, so this should work.
- Test locally first: `docker build` with these changes and verify
  `claude --version` and `gh --version` work as the `deno` user.

**Step 2: Commit**

```bash
git add .github/workflows/publish.yaml
git commit -m "chore: add Node.js, Claude Code, and gh CLI to Docker images"
```

---

### Task 9: Integration testing

**Step 1: Manual smoke test in sandbox mode**

Start the daemon locally in sandbox mode:

```bash
SANDBOX_MODE=true deno run --unstable-ffi -A daemon/main.ts
```

**Step 2: Test deploy with task**

```bash
# Deploy with a repo
curl -X POST http://localhost:8000/sandbox/deploy \
  -H "Content-Type: application/json" \
  -d '{"repo": "https://github.com/your-org/test-repo.git"}'

# Create a Claude task (requires ANTHROPIC_API_KEY in daemon env)
curl -X POST http://localhost:8000/sandbox/tasks \
  -H "Content-Type: application/json" \
  -d '{"prompt": "List the files in this repository"}'

# Check task status
curl http://localhost:8000/sandbox/tasks

# Attach via WebSocket (use wscat or similar)
wscat -c ws://localhost:8000/sandbox/tasks/t_TASKID/ws
```

**Step 3: Verify:**

- PTY output streams over WebSocket
- Task status updates from `running` → `completed`
- Claude process env does NOT leak into shell
- `DELETE /sandbox/tasks/:taskId` kills the process
- Undeploy cleans up all tasks

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration test fixes for Claude sandbox tasks"
```

---

### Summary of files created/modified:

| Action | File                             | Purpose                                           |
| ------ | -------------------------------- | ------------------------------------------------- |
| Create | `daemon/pty/session.ts`          | PTY session wrapper over `@sigma/pty-ffi`         |
| Create | `daemon/pty/manager.ts`          | PTY session registry                              |
| Create | `daemon/claude/github.ts`        | GitHub issue fetch, PR creation, issue comments   |
| Create | `daemon/claude/task.ts`          | Claude task lifecycle manager                     |
| Create | `daemon/claude/handlers.ts`      | Hono HTTP/WebSocket route handlers                |
| Modify | `daemon/sandbox.ts`              | Add `task` field to `DeployParams`                |
| Modify | `daemon/main.ts`                 | Mount Claude handlers, wire auto-task on deploy   |
| Modify | `deno.json`                      | Add `@sigma/pty-ffi` dependency                   |
| Modify | `.github/workflows/publish.yaml` | Add Node.js, Claude Code, gh CLI to Docker images |
