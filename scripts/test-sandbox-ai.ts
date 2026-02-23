#!/usr/bin/env -S deno run -A
/**
 * End-to-end test for the sandbox AI task flow.
 *
 * Usage:
 *   1. Start the daemon in sandbox mode (separate terminal):
 *        SANDBOX_MODE=true ANTHROPIC_API_KEY=sk-... DANGEROUSLY_ALLOW_PUBLIC_ACCESS=true \
 *          deno run --unstable-ffi -A daemon/main.ts
 *
 *   2. Run this script:
 *        deno run -A scripts/test-sandbox-ai.ts
 *
 * What it does:
 *   - Deploys "storefront" site
 *   - Waits for git clone to finish (triggers deps middleware)
 *   - Creates an AI task with an inline prompt ("redesign of homepage")
 *   - Connects via WebSocket to stream PTY output in real time
 *   - Polls task status until it completes or times out
 */

const BASE = Deno.env.get("DAEMON_URL") ?? "http://localhost:8000";
const TASK_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

// ─── Helpers ───────────────────────────────────────────────────────

async function request(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = `${BASE}${path}`;
  console.log(`→ ${init?.method ?? "GET"} ${url}`);
  const res = await fetch(url, init);
  console.log(`← ${res.status} ${res.statusText}`);
  return res;
}

function abort(msg: string): never {
  console.error(`\n[FAIL] ${msg}`);
  Deno.exit(1);
}

async function waitForGitReady(maxWaitMs = 180_000): Promise<void> {
  // The deps middleware (ensureGit, manifest gen, etc.) runs lazily on
  // the first request through the site app. The daemon API routes
  // require the x-daemon-api header. We hit /git/log which blocks
  // until deps (git clone, manifest gen) finish, then returns.
  console.log("Triggering site deps (git clone, manifest gen)...");
  console.log("This request blocks until the clone + setup finishes.\n");

  const start = Date.now();
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), maxWaitMs);

  try {
    const res = await fetch(
      `${BASE}/git/log?limit=1&x-daemon-api=true`,
      { signal: ac.signal },
    );
    clearTimeout(timeout);
    const elapsed = ((Date.now() - start) / 1000).toFixed(0);
    if (res.ok) {
      console.log(`  Git ready after ${elapsed}s`);
    } else {
      const body = await res.text();
      console.log(
        `  /git/log returned ${res.status} after ${elapsed}s: ${body}`,
      );
      console.log("  Proceeding anyway — git may still be usable.");
    }
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof DOMException && err.name === "AbortError") {
      abort("Timed out waiting for git clone to finish");
    }
    throw err;
  }
}

// ─── Step 0: Health check ──────────────────────────────────────────

console.log("\n=== Step 0: Health check ===\n");
try {
  const hc = await request("/_healthcheck");
  if (!hc.ok) abort("Daemon not reachable. Is it running?");
  const version = await hc.text();
  console.log(`Daemon version: ${version}`);
} catch (err) {
  abort(
    `Cannot connect to daemon at ${BASE}. Start it with:\n` +
      `  SANDBOX_MODE=true ANTHROPIC_API_KEY=sk-... DANGEROUSLY_ALLOW_PUBLIC_ACCESS=true \\\n` +
      `    deno run --unstable-ffi -A daemon/main.ts\n\nError: ${err}`,
  );
}

// ─── Step 1: Check sandbox status ──────────────────────────────────

console.log("\n=== Step 1: Check sandbox status ===\n");
{
  const res = await request("/sandbox/status");
  const status = await res.json();
  console.log("Status:", JSON.stringify(status, null, 2));

  if (status.deployed) {
    console.log("Already deployed — undeploying first...");
    const undeploy = await request("/sandbox/deploy", { method: "DELETE" });
    console.log("Undeploy:", await undeploy.json());
    // Wait for cleanup
    await new Promise((r) => setTimeout(r, 3000));
  }
}

// ─── Step 2: Deploy "storefront" ──────────────────────────────────

console.log("\n=== Step 2: Deploy storefront ===\n");
{
  const res = await request("/sandbox/deploy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      site: "storefront",
    }),
  });

  const body = await res.json();
  console.log("Deploy response:", JSON.stringify(body, null, 2));

  if (!res.ok) {
    abort(`Deploy failed: ${JSON.stringify(body)}`);
  }
}

// ─── Step 2.5: Wait for git to be ready ────────────────────────────

console.log("\n=== Step 2.5: Wait for git clone ===\n");
await waitForGitReady();

// ─── Step 3: Create AI task ────────────────────────────────────────

console.log("\n=== Step 3: Create AI task ===\n");
let taskId: string;
{
  const res = await request("/sandbox/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt:
        "Add a 'Getting Started' section to the README.md file with 3 steps: clone, install deps, run dev server. Keep it short.",
    }),
  });

  const body = await res.json();
  console.log("Task response:", JSON.stringify(body, null, 2));

  if (!res.ok) {
    abort(`Failed to create task: ${JSON.stringify(body)}`);
  }

  taskId = body.taskId;
  console.log(`Task created: ${taskId}`);
}

// ─── Step 4: Connect WebSocket ─────────────────────────────────────

console.log("\n=== Step 4: Connect WebSocket for PTY output ===\n");

const wsUrl = `${BASE.replace("http", "ws")}/sandbox/tasks/${taskId}/ws`;
console.log(`Connecting to ${wsUrl}...\n`);
console.log("─".repeat(60));
console.log("PTY OUTPUT:");
console.log("─".repeat(60));

let wsResolved = false;
const wsDone = new Promise<void>((resolve) => {
  const ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log("[ws] Connected\n");
  };

  ws.onmessage = (event) => {
    const data = event.data as string;

    // Check for exit message
    try {
      const msg = JSON.parse(data);
      if (msg.type === "exit") {
        console.log(`\n[ws] Process exited with code ${msg.code}`);
        ws.close();
        return;
      }
    } catch {
      // Not JSON — regular PTY output
    }

    // Print PTY output
    Deno.stdout.writeSync(new TextEncoder().encode(data));
  };

  ws.onerror = (event) => {
    console.error("[ws] Error:", event);
  };

  ws.onclose = () => {
    console.log("[ws] Disconnected");
    if (!wsResolved) {
      wsResolved = true;
      resolve();
    }
  };

  // Timeout safety
  setTimeout(() => {
    if (!wsResolved) {
      console.log("\n[ws] Timeout — closing WebSocket");
      ws.close();
      wsResolved = true;
      resolve();
    }
  }, TASK_TIMEOUT_MS);
});

// ─── Step 5: Poll task status ──────────────────────────────────────

const pollInterval = setInterval(async () => {
  try {
    const res = await fetch(`${BASE}/sandbox/tasks/${taskId}`);
    if (res.ok) {
      const info = await res.json();
      if (info.status === "completed" || info.status === "failed") {
        console.log(`\n[poll] Task ${taskId} finished: ${info.status}`);
        if (info.prUrl) {
          console.log(`[poll] PR URL: ${info.prUrl}`);
        }
        clearInterval(pollInterval);
      }
    }
  } catch {
    // Ignore polling errors
  }
}, 15_000);

// Wait for WebSocket to close (task exit or timeout)
await wsDone;
clearInterval(pollInterval);

// ─── Step 6: Final status ──────────────────────────────────────────

console.log(`\n${"─".repeat(60)}`);
console.log("\n=== Step 6: Final task status ===\n");
{
  const res = await request(`/sandbox/tasks/${taskId}`);
  if (res.ok) {
    const info = await res.json();
    console.log(JSON.stringify(info, null, 2));
  }
}

// ─── Step 7: List all tasks ────────────────────────────────────────

console.log("\n=== Step 7: All tasks ===\n");
{
  const res = await request("/sandbox/tasks");
  if (res.ok) {
    const list = await res.json();
    console.log(JSON.stringify(list, null, 2));
  }
}

console.log("\n[DONE] Test complete.\n");
