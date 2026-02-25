import { getGitHubToken, setupGithubTokenNetrc } from "../git.ts";
import { GITHUB_APP_CONFIGURED, setupGitHubAppNetrc } from "../githubApp.ts";
import { PtySession } from "../pty/session.ts";
import {
  buildPromptFromIssue,
  commentOnIssue,
  createPR,
  fetchIssue,
  type IssueContext,
} from "./github.ts";

const GITHUB_APP_KEY = Deno.env.get("GITHUB_APP_KEY");
const HAS_GITHUB_AUTH = GITHUB_APP_CONFIGURED || Boolean(GITHUB_APP_KEY);
const TOKEN_REFRESH_MS = 45 * 60 * 1000; // 45 minutes (tokens expire after 1 hour)

/** Write GitHub token to agent home files so git and gh CLI pick up refreshed tokens. */
async function writeAgentTokenFiles(
  agentHome: string,
  token: string,
): Promise<void> {
  // .netrc for git HTTPS auth (read per-connection)
  const netrcContent =
    `machine github.com\nlogin x-access-token\npassword ${token}\n`;
  await Deno.writeTextFile(`${agentHome}/.netrc`, netrcContent);
  await Deno.chmod(`${agentHome}/.netrc`, 0o600);

  // gh CLI config (read per-command when GITHUB_TOKEN env var is not set)
  const ghConfigDir = `${agentHome}/.config/gh`;
  Deno.mkdirSync(ghConfigDir, { recursive: true });
  const hostsContent =
    `github.com:\n    oauth_token: ${token}\n    user: x-access-token\n    git_protocol: https\n`;
  await Deno.writeTextFile(`${ghConfigDir}/hosts.yml`, hostsContent);
}

export interface AITaskOptions {
  /** GitHub issue URL — mutually exclusive with `prompt`. */
  issue?: string;
  /** Inline prompt — mutually exclusive with `issue`. */
  prompt?: string;
  /** Working directory (the cloned repo). */
  cwd: string;
  /** AI provider API key — injected into the agent's env only. */
  apiKey?: string;
  /** GITHUB_TOKEN — injected into the agent's and gh's env only. */
  githubToken?: string;
  /** Extra env vars for the agent process. */
  extraEnv?: Record<string, string>;
  /** When true, route API traffic through the admin proxy instead of using apiKey directly. */
  useProvidedKey?: boolean;
  /** Admin proxy URL (e.g. https://admin.deco.cx/api/anthropic-proxy). */
  proxyUrl?: string;
  /** Scoped JWT token for authenticating with the admin proxy. */
  proxyToken?: string;
}

export type AITaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed";

export type AITaskType = "interactive" | "prompt" | "issue";

export interface AITaskInfo {
  taskId: string;
  status: AITaskStatus;
  type: AITaskType;
  issue?: string;
  prompt?: string;
  prUrl?: string | null;
  createdAt: number;
}

/** Extract owner/repo from a git remote URL. */
async function getRepoInfo(
  cwd: string,
): Promise<{ owner: string; repo: string }> {
  const cmd = new Deno.Command("git", {
    args: ["remote", "get-url", "origin"],
    cwd,
    stdout: "piped",
    stderr: "piped",
  });
  const output = await cmd.output();
  if (!output.success) {
    const stderr = new TextDecoder().decode(output.stderr);
    throw new Error(`git remote get-url origin failed: ${stderr}`);
  }
  const url = new TextDecoder().decode(output.stdout).trim();

  // Match: https://github.com/owner/repo.git OR git@github.com:owner/repo.git
  const match = url.match(
    /github\.com[:/]([^/]+)\/([^/.]+?)(?:\.git)?$/,
  );
  if (!match) {
    throw new Error(`Cannot parse owner/repo from git remote: ${url}`);
  }
  return { owner: match[1], repo: match[2] };
}

/** Shared env for daemon-side git commands — includes HOME so git can find ~/.gitconfig and SSH keys. */
function gitEnv(githubToken?: string): Record<string, string> {
  const home = Deno.env.get("HOME") ?? "/home/deno";
  const env: Record<string, string> = {
    HOME: home,
    PATH: Deno.env.get("PATH") ?? "",
  };
  // Only use SSH when no GitHub App auth is available (legacy SSH path)
  if (!HAS_GITHUB_AUTH) {
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
  readonly type: AITaskType;

  #session: PtySession | null = null;
  #status: AITaskStatus = "pending";
  #prUrl: string | null = null;
  #issueCtx: IssueContext | null = null;
  #opts: AITaskOptions;
  #startSha: string | null = null;
  #githubToken: string | null = null;
  #tokenRefreshInterval: ReturnType<typeof setInterval> | null = null;
  #repoInfo: { owner: string; repo: string } | null = null;

  get status() {
    return this.#status;
  }

  get session() {
    return this.#session;
  }

  constructor(opts: AITaskOptions) {
    this.taskId = `t_${crypto.randomUUID().slice(0, 8)}`;
    this.createdAt = Date.now();
    this.issue = opts.issue;
    this.prompt = opts.prompt;
    this.type = opts.issue ? "issue" : opts.prompt ? "prompt" : "interactive";
    this.#opts = opts;
  }

  async start(): Promise<void> {
    this.#status = "running";

    // Save the current HEAD SHA so we can compare after the task completes
    const headCmd = new Deno.Command("git", {
      args: ["rev-parse", "HEAD"],
      cwd: this.#opts.cwd,
      stdout: "piped",
      stderr: "piped",
    });
    const headOutput = await headCmd.output();
    if (!headOutput.success) {
      throw new Error(
        `Failed to determine HEAD SHA in ${this.#opts.cwd}`,
      );
    }
    this.#startSha = new TextDecoder().decode(headOutput.stdout).trim();

    // Self-provision a scoped GitHub token
    let githubToken = this.#opts.githubToken;
    if (!githubToken && GITHUB_APP_CONFIGURED) {
      // New path: direct GitHub App token generation
      try {
        this.#repoInfo = await getRepoInfo(this.#opts.cwd);
        githubToken = await setupGitHubAppNetrc(
          this.#repoInfo.owner,
          this.#repoInfo.repo,
        );
      } catch (err) {
        console.error(`[ai] Failed to provision GitHub token:`, err);
      }
    } else if (!githubToken && GITHUB_APP_KEY) {
      // Legacy path: fetch token via admin API
      try {
        await setupGithubTokenNetrc();
        githubToken = await getGitHubToken() ?? undefined;
      } catch (err) {
        console.error(`[ai] Failed to provision GitHub token (legacy):`, err);
      }
    }
    this.#githubToken = githubToken ?? null;

    // Build the prompt (if any — no prompt means interactive mode)
    let taskPrompt: string | undefined;
    if (this.#opts.issue) {
      if (!githubToken) {
        throw new Error("GITHUB_TOKEN required for issue-based tasks");
      }
      this.#issueCtx = await fetchIssue(
        this.#opts.issue,
        githubToken,
      );
      taskPrompt = buildPromptFromIssue(this.#issueCtx);
    } else if (this.#opts.prompt) {
      taskPrompt = this.#opts.prompt;
    }

    // Build env for the AI agent child process — secrets go here, NOT in shell.
    // Use a sandboxed home dir so the agent cannot access ~/.ssh keys
    // through standard paths (git config, ssh defaults).
    const realHome = Deno.env.get("HOME") ?? "/home/deno";
    const agentHome = `${this.#opts.cwd}/.agent-home`;
    Deno.mkdirSync(agentHome, { recursive: true });
    const env: Record<string, string> = {
      ...this.#opts.extraEnv,
      HOME: agentHome,
      PATH: [
        Deno.env.get("PATH") ?? "",
        `${realHome}/.local/bin`,
        `${realHome}/.deno/bin`,
        "/usr/local/bin",
      ].join(":"),
    };

    if (
      this.#opts.useProvidedKey && this.#opts.proxyUrl && this.#opts.proxyToken
    ) {
      // Platform-provided key via proxy — real key never touches the sandbox
      env.ANTHROPIC_BASE_URL = this.#opts.proxyUrl;
      env.ANTHROPIC_API_KEY = this.#opts.proxyToken;
    } else if (this.#opts.apiKey) {
      env.ANTHROPIC_API_KEY = this.#opts.apiKey;
    }

    if (HAS_GITHUB_AUTH && githubToken) {
      // File-based auth: write .netrc + gh config so both git and gh CLI
      // pick up refreshed tokens automatically (env vars can't be updated).
      await writeAgentTokenFiles(agentHome, githubToken);

      // Refresh token files every 45 min (tokens expire after 1 hour)
      this.#tokenRefreshInterval = setInterval(async () => {
        try {
          let newToken: string | undefined;
          if (GITHUB_APP_CONFIGURED && this.#repoInfo) {
            newToken = await setupGitHubAppNetrc(
              this.#repoInfo.owner,
              this.#repoInfo.repo,
            );
          } else if (GITHUB_APP_KEY) {
            await setupGithubTokenNetrc();
            newToken = await getGitHubToken();
          }
          if (newToken) {
            this.#githubToken = newToken;
            await writeAgentTokenFiles(agentHome, newToken);
            console.log(`[ai] Token refreshed for task ${this.taskId}`);
          }
        } catch (err) {
          console.error(
            `[ai] Token refresh failed for task ${this.taskId}:`,
            err,
          );
        }
      }, TOKEN_REFRESH_MS);
    } else if (githubToken) {
      // Legacy path: pass token as env var (no refresh needed for short-lived tasks)
      env.GITHUB_TOKEN = githubToken;
    }

    // Interactive mode: just `claude` with no --print
    // Task mode: `claude --print --dangerously-skip-permissions <prompt>`
    const claudeArgs = taskPrompt
      ? ["--print", "--dangerously-skip-permissions", taskPrompt]
      : ["--dangerously-skip-permissions"];

    try {
      this.#session = await PtySession.create({
        cmd: "claude",
        args: claudeArgs,
        env,
        cwd: this.#opts.cwd,
        cols: 120,
        rows: 40,
      });

      this.#session.onExit((code) => {
        this.#onComplete(code).catch((err) => {
          console.error(`[ai] Post-completion failed:`, err);
        });
      });
    } catch (err) {
      this.#status = "failed";
      if (this.#tokenRefreshInterval) {
        clearInterval(this.#tokenRefreshInterval);
        this.#tokenRefreshInterval = null;
      }
      throw err;
    }
  }

  async #onComplete(exitCode: number): Promise<void> {
    const success = exitCode === 0;
    this.#status = success ? "completed" : "failed";

    // Stop the token refresh interval — task is done
    if (this.#tokenRefreshInterval) {
      clearInterval(this.#tokenRefreshInterval);
      this.#tokenRefreshInterval = null;
    }

    console.log(
      `[ai] Task ${this.taskId} exited with code ${exitCode}`,
    );

    // Only run GitHub flow if this was an issue-based task
    if (!this.#issueCtx) return;

    // Refresh token (tokens expire after 1 hour)
    let githubToken = this.#githubToken;
    if (GITHUB_APP_CONFIGURED) {
      try {
        const info = this.#repoInfo ?? {
          owner: this.#issueCtx.owner,
          repo: this.#issueCtx.repo,
        };
        githubToken = await setupGitHubAppNetrc(info.owner, info.repo);
      } catch (err) {
        console.error(`[ai] Token refresh failed:`, err);
      }
    } else if (GITHUB_APP_KEY) {
      try {
        await setupGithubTokenNetrc();
        githubToken = await getGitHubToken() ?? githubToken;
      } catch (err) {
        console.error(`[ai] Token refresh failed (legacy):`, err);
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
      stderr: "piped",
      env,
    });
    const branchOutput = await branchCmd.output();
    if (!branchOutput.success) {
      console.error(
        `[ai] Failed to determine branch for task ${this.taskId}`,
      );
      return;
    }
    const branch = new TextDecoder().decode(branchOutput.stdout).trim();

    if (!this.#startSha) {
      console.error(
        `[ai] No start SHA recorded — skipping PR flow for task ${this.taskId}`,
      );
      return;
    }

    // Check if there are new commits since the task started
    const diffCmd = new Deno.Command("git", {
      args: ["diff", "--stat", `${this.#startSha}..HEAD`],
      cwd: this.#opts.cwd,
      stdout: "piped",
      stderr: "piped",
      env,
    });
    const diffOutput = await diffCmd.output();
    const hasDiff = diffOutput.success &&
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
    const pushOutput = await pushCmd.output();
    if (!pushOutput.success) {
      const stderr = new TextDecoder().decode(pushOutput.stderr);
      console.error(
        `[ai] git push failed for task ${this.taskId}: ${stderr}`,
      );
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
      type: this.type,
      issue: this.issue,
      prompt: this.prompt,
      prUrl: this.#prUrl,
      createdAt: this.createdAt,
    };
  }

  dispose(): void {
    if (this.#tokenRefreshInterval) {
      clearInterval(this.#tokenRefreshInterval);
      this.#tokenRefreshInterval = null;
    }
    if (this.#session) {
      this.#session.dispose();
    }
  }
}
