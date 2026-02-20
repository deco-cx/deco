import { PtySession } from "../pty/session.ts";
import {
  buildPromptFromIssue,
  commentOnIssue,
  createPR,
  fetchIssue,
  type IssueContext,
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

    this.#session = await PtySession.create({
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

  dispose(): void {
    if (this.#session) {
      this.#session.dispose();
    }
  }
}
