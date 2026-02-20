# Claude Agent Integration for Sandbox Environments

## Problem

We want AI agents (Claude Code) to work on GitHub issues inside sandbox
environments. The daemon already supports sandbox mode with deploy/undeploy
lifecycle. We need to add:

1. General-purpose PTY sessions for remote pod access
2. Claude Code task management on top of PTY sessions
3. Auto PR creation and GitHub issue reporting on task completion

## Architecture

### Module Structure

```
daemon/
├── pty/
│   ├── session.ts       # PtySession: wraps @sigma/pty-ffi, manages lifecycle
│   └── manager.ts       # SessionManager: tracks sessions by ID, cleanup
├── claude/
│   ├── task.ts          # ClaudeTask: PTY session + Claude lifecycle (auto-PR, issue comment)
│   ├── github.ts        # GitHub integration: issue fetching, PR creation, comment posting
│   └── handlers.ts      # Hono route handlers for /sandbox/tasks endpoints
```

### PTY Layer (`daemon/pty/`)

Uses [`@sigma/pty-ffi`](https://jsr.io/@sigma/pty-ffi) (Deno FFI wrapper over
Rust portable-pty).

**`PtySession`** manages a single PTY:

- `id: string` — unique session identifier
- `pid: number` — OS process ID
- `status: "running" | "exited"` — lifecycle state
- `exitCode: number | null` — set on exit
- `createdAt: number` — timestamp
- `write(data: string)` — send input
- `resize(cols: number, rows: number)` — resize terminal
- `kill()` — terminate process
- `onData(cb: (data: string) => void)` — output callback
- `onExit(cb: (code: number) => void)` — exit callback

**`SessionManager`** is the registry:

- `spawn(cmd: string, args: string[], opts?: SpawnOpts)` — create session,
  return ID
- `get(id: string)` — lookup
- `kill(id: string)` — terminate + cleanup
- `list()` — all sessions with metadata
- `dispose()` — kill all sessions (for undeploy)

### Claude Task Layer (`daemon/claude/`)

**`ClaudeTask`** wraps a PTY session with Claude-specific behavior:

- Spawns `claude --print --dangerously-skip-permissions "<prompt>"` in a PTY
- Injects `ANTHROPIC_API_KEY` and `GITHUB_TOKEN` into the child process env only
  (not the PTY shell env)
- Captures output buffer for summary
- On exit code 0: triggers auto-PR + GitHub issue comment
- Tracks: task ID, prompt/issue URL, status, output

**`github.ts`** handles GitHub operations via `gh` CLI:

- `fetchIssue(url)` — parse issue URL, fetch title + body + comments via
  `gh issue view`
- `createPR(opts)` — run `gh pr create` with title referencing the issue
- `commentOnIssue(url, body)` — post completion summary via `gh issue comment`

### API Endpoints (`daemon/claude/handlers.ts`)

All endpoints require admin JWT authentication (existing `daemon/auth.ts`).

#### `POST /sandbox/tasks`

Create a new Claude task. Two modes:

```typescript
// Mode 1: GitHub issue
{ "issue": "https://github.com/org/repo/issues/42" }

// Mode 2: Inline prompt
{ "prompt": "Add dark mode toggle to settings page" }
```

Both modes optionally accept `"branch": "fix/issue-42"` to work on a specific
branch.

Response:

```json
{ "taskId": "t_abc123", "pid": 12345, "status": "running" }
```

Flow:

1. If issue URL: fetch issue context via `gh issue view`
2. Build Claude prompt from issue or inline prompt
3. Spawn Claude in PTY with secrets injected into child env
4. Return task metadata

#### `GET /sandbox/tasks`

List all tasks with status.

#### `GET /sandbox/tasks/:taskId`

Get task details: status, pid, exit code, output summary.

#### `GET /sandbox/tasks/:taskId/ws`

WebSocket for PTY attach. Auth via query param token on upgrade.

Protocol:

- Server to client: raw PTY output (string)
- Client to server: `{ "type": "input", "data": "..." }` or
  `{ "type": "resize", "cols": 80, "rows": 24 }`
- On exit: server sends `{ "type": "exit", "code": 0 }` then closes

#### `DELETE /sandbox/tasks/:taskId`

Kill the task process.

### Deploy Integration

The existing `POST /sandbox/deploy` gains an optional `task` field:

```json
{
  "repo": "https://github.com/org/my-repo.git",
  "branch": "fix/issue-42",
  "envs": { "NODE_ENV": "production" },
  "task": {
    "issue": "https://github.com/org/repo/issues/42"
  }
}
```

When `task` is present, after deploy completes (git clone, manifests), the
daemon automatically creates a Claude task.

### Task Completion Flow

When Claude process exits with code 0:

1. Read token usage from `~/.claude/stats-cache.json` (like Ralph)
2. Run `gh pr create` in the repo working directory
3. Run `gh issue comment` on the original issue with:
   - Status (success/failure)
   - PR link
   - Token usage / estimated cost
4. Task status becomes `completed`

## Dockerfile Changes

The current Alpine-based image gets these additions:

```dockerfile
# Node.js (required by Claude Code)
RUN apk add nodejs npm

# System tools
RUN apk add git openssh curl jq

# GitHub CLI
RUN apk add github-cli

# Claude Code
RUN npm install -g @anthropic-ai/claude-code

# Verify
RUN claude --version && gh --version
```

All daemons get Claude Code + gh CLI in a single image.

## Security Model

**Authentication:**

- All `/sandbox/tasks` endpoints use existing admin JWT auth from
  `daemon/auth.ts`
- WebSocket upgrade validates JWT from query param

**Env var isolation:**

- PTY shell environment is clean (no secrets)
- `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`, and deploy `envs` are injected only into
  specific child processes (Claude, gh) via the PTY constructor's env option
- Users with PTY access cannot `echo $ANTHROPIC_API_KEY` to reveal secrets

## Dependencies

- `@sigma/pty-ffi` (JSR) — Deno FFI PTY wrapper
- `gh` CLI — GitHub operations (installed in Dockerfile)
- `claude` CLI (`@anthropic-ai/claude-code`) — AI agent (installed in
  Dockerfile)
