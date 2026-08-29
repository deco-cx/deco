#!/usr/bin/env node
/**
 * Claude Agent SDK bridge for the Deno daemon.
 *
 * Spawned by task.ts when USE_AGENT_SDK=true.
 * Reads: prompt from argv[2], options from env vars
 * Writes: newline-delimited JSON events to stdout
 *
 * Usage: node task-sdk.mjs "<prompt>"
 */

import { query } from "@anthropic-ai/claude-agent-sdk";

const prompt = process.argv[2] ?? "";
const cwd = process.env.AGENT_CWD ?? process.cwd();
const apiKey = process.env.ANTHROPIC_API_KEY;
const proxyUrl = process.env.ANTHROPIC_PROXY_URL;
const proxyToken = process.env.ANTHROPIC_PROXY_TOKEN;

const options = {
  cwd,
  ...(apiKey ? {} : {}), // SDK picks up ANTHROPIC_API_KEY from env automatically
  ...(proxyUrl ? { apiBaseUrl: proxyUrl } : {}),
};

// Signal that we started
process.stdout.write(
  JSON.stringify({ type: "sdk_ready", cwd, prompt: prompt.slice(0, 80) }) + "\n"
);

try {
  for await (const event of query({ prompt, options })) {
    process.stdout.write(JSON.stringify(event) + "\n");
  }
} catch (err) {
  process.stdout.write(
    JSON.stringify({ type: "sdk_error", error: String(err) }) + "\n"
  );
  process.exit(1);
}
