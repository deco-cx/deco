import { getGitHubToken, setupGithubTokenNetrc } from "../git.ts";
import { PtySession } from "../pty/session.ts";
import {
  buildPromptFromIssue,
  commentOnIssue,
  createPR,
  fetchIssue,
  type IssueContext,
} from "./github.ts";

const GITHUB_APP_KEY = Deno.env.get("GITHUB_APP_KEY");

export interface AITaskOptions {
  /** GitHub issue URL — mutually exclusive with `prompt`. */
  issue?: string;
  /** Inline prompt — mutually exclusive with `issue`. */
  prompt?: string;
  /** Working directory (the cloned repo). */
  cwd: string;
  /** AI provider API key — injected into the agent's env only. */
  apiKey: string;
  /** GITHUB_TOKEN — injected into the agent's and gh's env only. */
  githubToken?: string;
  /** Extra env vars for the agent process. */
  extraEnv?: Record<string, string>;
}

export type AITaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed";

export interface AITaskInfo {
  taskId: string;
  status: AITaskStatus;
  issue?: string;
  prompt?: string;
  prUrl?: string | null;
  createdAt: number;
}

/** Shared env for daemon-side git commands — includes HOME so git can find ~/.gitconfig and SSH keys. */
function gitEnv(githubToken?: string): Record<string, string> {
  const home = Deno.env.get("HOME") ?? "/home/deno";
  const env: Record<string, string> = {
    HOME: home,
    PATH: Deno.env.get("PATH") ?? "",
  };
  // Only use SSH when GITHUB_APP_KEY is not set (legacy path)
  if (!GITHUB_APP_KEY) {
    env.GIT_SSH_COMMAND =
      `ssh -i ${home}/.ssh/id_rsa -o StrictHostKeyChecking=no`;
  }
  if (githubToken) {
    env.GITHUB_TOKEN = githubToken;
  }
  return env;
}

export class AITask {
  readonly taskId: string;
  readonly createdAt: number;
  readonly issue?: string;
  readonly prompt?: string;

  #session: PtySession | null = null;
  #status: AITaskStatus = "pending";
  #prUrl: string | null = null;
  #issueCtx: IssueContext | null = null;
  #opts: AITaskOptions;
  #startSha: string | null = null;
  #githubToken: string | null = null;

  get status() {
    return this.#status;
  }

  get session() {
    return this.#session;
  }

  constructor(opts: AITaskOptions) {
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

    // Save the current HEAD SHA so we can compare after the task completes
    const headCmd = new Deno.Command("git", {
      args: ["rev-parse", "HEAD"],
      cwd: this.#opts.cwd,
      stdout: "piped",
    });
    const headOutput = await headCmd.output();
    this.#startSha = new TextDecoder().decode(headOutput.stdout).trim();

    // Self-provision a scoped GitHub token when GITHUB_APP_KEY is available
    let githubToken = this.#opts.githubToken;
    if (GITHUB_APP_KEY && !githubToken) {
      try {
        await setupGithubTokenNetrc(); // writes ~/.netrc for daemon git ops
        githubToken = await getGitHubToken() ?? undefined;
      } catch (err) {
        console.error(`[ai] Failed to provision GitHub token:`, err);
      }
    }
    this.#githubToken = githubToken ?? null;

    // Build the prompt
    let taskPrompt: string;
    if (this.#opts.issue) {
      if (!githubToken) {
        throw new Error("GITHUB_TOKEN required for issue-based tasks");
      }
      this.#issueCtx = await fetchIssue(
        this.#opts.issue,
        githubToken,
      );
      taskPrompt = buildPromptFromIssue(this.#issueCtx);
    } else {
      taskPrompt = this.#opts.prompt!;
    }

    // Build env for the AI agent child process — secrets go here, NOT in shell.
    // Use a sandboxed home dir so the agent cannot access ~/.ssh keys
    // through standard paths (git config, ssh defaults).
    const realHome = Deno.env.get("HOME") ?? "/home/deno";
    const agentHome = `${this.#opts.cwd}/.agent-home`;
    try {
      Deno.mkdirSync(agentHome, { recursive: true });
    } catch { /* already exists */ }
    const env: Record<string, string> = {
      ANTHROPIC_API_KEY: this.#opts.apiKey,
      HOME: agentHome,
      PATH: Deno.env.get("PATH") ?? "",
      ...this.#opts.extraEnv,
    };
    if (githubToken) {
      env.GITHUB_TOKEN = githubToken;
    }

    this.#session = await PtySession.create({
      cmd: "claude",
      args: ["--print", "--dangerously-skip-permissions", taskPrompt],
      env,
      cwd: this.#opts.cwd,
    });

    this.#session.onExit((code) => {
      this.#onComplete(code).catch((err) => {
        console.error(`[ai] Post-completion failed:`, err);
      });
    });
  }

  async #onComplete(exitCode: number): Promise<void> {
    const success = exitCode === 0;
    this.#status = success ? "completed" : "failed";

    console.log(
      `[ai] Task ${this.taskId} exited with code ${exitCode}`,
    );

    // Only run GitHub flow if this was an issue-based task
    if (!this.#issueCtx) return;

    // Refresh token if using GitHub App (tokens expire after 1 hour)
    let githubToken = this.#githubToken;
    if (GITHUB_APP_KEY) {
      try {
        await setupGithubTokenNetrc();
        githubToken = await getGitHubToken() ?? githubToken;
      } catch (err) {
        console.error(`[ai] Token refresh failed:`, err);
      }
    }

    if (!githubToken) {
      console.error(`[ai] No GitHub token available for post-completion flow`);
      return;
    }

    const { owner, repo, number: issueNumber, title } = this.#issueCtx;
    const env = gitEnv(githubToken);

    // Get current branch
    const branchCmd = new Deno.Command("git", {
      args: ["rev-parse", "--abbrev-ref", "HEAD"],
      cwd: this.#opts.cwd,
      stdout: "piped",
      env,
    });
    const branchOutput = await branchCmd.output();
    const branch = new TextDecoder().decode(branchOutput.stdout).trim();

    // Check if there are new commits since the task started
    const diffCmd = new Deno.Command("git", {
      args: ["diff", "--stat", `${this.#startSha}..HEAD`],
      cwd: this.#opts.cwd,
      stdout: "piped",
      env,
    });
    const diffOutput = await diffCmd.output();
    const hasDiff =
      new TextDecoder().decode(diffOutput.stdout).trim().length > 0;

    if (!hasDiff) {
      console.log(`[ai] No changes to create PR for task ${this.taskId}`);
      await commentOnIssue({
        owner,
        repo,
        issueNumber,
        prUrl: null,
        success: false,
        token: githubToken,
      });
      return;
    }

    // Push the branch
    const pushCmd = new Deno.Command("git", {
      args: ["push", "-u", "origin", branch],
      cwd: this.#opts.cwd,
      stdout: "piped",
      stderr: "piped",
      env,
    });
    await pushCmd.output();

    // Create PR
    this.#prUrl = await createPR({
      owner,
      repo,
      issueNumber,
      issueTitle: title,
      branch,
      token: githubToken,
      cwd: this.#opts.cwd,
    });

    console.log(
      `[ai] PR created for task ${this.taskId}: ${this.#prUrl}`,
    );

    // Comment on issue
    await commentOnIssue({
      owner,
      repo,
      issueNumber,
      prUrl: this.#prUrl,
      success,
      token: githubToken,
    });
  }

  info(): AITaskInfo {
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
