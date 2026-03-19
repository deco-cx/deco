import { getGitHubToken, lockerGitAPI, setupGithubTokenNetrc } from "../git.ts";
import {
  AGENT_PERMISSIONS,
  GITHUB_APP_CONFIGURED,
  mintScopedToken,
  resolveDefaultBranch,
  setBranchProtection,
  setupGitHubAppNetrc,
} from "../githubApp.ts";
import { resetActivity } from "../monitor.ts";
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
  /** Admin proxy URL — when set (with proxyToken), routes API traffic through the proxy. */
  proxyUrl?: string;
  /** Scoped JWT token for authenticating with the admin proxy. */
  proxyToken?: string;
  /** When true, commit any uncommitted changes after Claude exits. */
  shouldCommitChanges?: boolean;
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
  loginUrl?: string | null;
  createdAt: number;
}

import { parseRepoUrl } from "./repoUrl.ts";

/** Extract owner/repo/defaultBranch from the origin remote in a working tree. */
async function getRepoInfo(
  cwd: string,
): Promise<{ owner: string; repo: string; defaultBranch: string | null }> {
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
  const { owner, repo } = parseRepoUrl(url);

  let defaultBranch: string | null = null;
  try {
    const refCmd = new Deno.Command("git", {
      args: ["symbolic-ref", "refs/remotes/origin/HEAD"],
      cwd,
      stdout: "piped",
      stderr: "piped",
    });
    const refOutput = await refCmd.output();
    if (refOutput.success) {
      const ref = new TextDecoder().decode(refOutput.stdout).trim();
      const branch = ref.replace(/^refs\/remotes\/origin\//, "");
      if (branch) defaultBranch = branch;
    }
  } catch {
    // symbolic-ref unavailable (shallow clone, missing remote HEAD, etc.)
  }

  if (!defaultBranch) {
    console.warn(
      `[ai] Could not detect default branch for ${owner}/${repo} via git symbolic-ref; ` +
        `will attempt GitHub API fallback before applying branch protection`,
    );
  }

  return { owner, repo, defaultBranch };
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
  #disposed = false;
  #prUrl: string | null = null;
  #loginUrl: string | null = null;
  #stdoutBuffer = "";
  #issueCtx: IssueContext | null = null;
  #opts: AITaskOptions;
  #startSha: string | null = null;
  #githubToken: string | null = null;
  #tokenRefreshInterval: ReturnType<typeof setInterval> | null = null;
  #activityInterval: ReturnType<typeof setInterval> | null = null;
  #repoInfo:
    | { owner: string; repo: string; defaultBranch: string | null }
    | null = null;

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
      // New path: two-token pattern — admin token for branch protection (discarded),
      // restricted agent token for .agent-home (no administration permission)
      try {
        this.#repoInfo = await getRepoInfo(this.#opts.cwd);
        // Daemon's own .netrc: full-permission token for git push in onComplete
        await setupGitHubAppNetrc(
          this.#repoInfo.owner,
          this.#repoInfo.repo,
        );

        // Set branch protection with a short-lived admin token, then discard it
        try {
          const adminToken = await mintScopedToken(
            this.#repoInfo.owner,
            this.#repoInfo.repo,
            { administration: "write", metadata: "read" },
          );

          let branch = this.#repoInfo.defaultBranch;
          if (!branch) {
            try {
              branch = await resolveDefaultBranch(
                this.#repoInfo.owner,
                this.#repoInfo.repo,
                adminToken,
              );
              this.#repoInfo.defaultBranch = branch;
            } catch (apiErr) {
              console.warn(
                "[ai] GitHub API fallback for default branch failed:",
                apiErr,
              );
            }
          }

          if (branch) {
            await setBranchProtection(
              this.#repoInfo.owner,
              this.#repoInfo.repo,
              branch,
              adminToken,
            );
          } else {
            console.warn(
              "[ai] branch protection skipped: could not determine default branch",
            );
          }
        } catch (err) {
          console.warn("[ai] branch protection setup skipped:", err);
        }

        // Agent token: restricted — no administration permission
        githubToken = await mintScopedToken(
          this.#repoInfo.owner,
          this.#repoInfo.repo,
          { ...AGENT_PERMISSIONS },
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

    // Pre-seed Claude config so it skips the interactive onboarding/login flow
    const claudeConfig = `${agentHome}/.claude.json`;
    try {
      await Deno.stat(claudeConfig);
    } catch {
      await Deno.writeTextFile(
        claudeConfig,
        JSON.stringify({
          hasCompletedOnboarding: true,
          numStartups: 1,
          firstStartTime: new Date().toISOString(),
        }),
      );
    }

    const env: Record<string, string> = {
      ...this.#opts.extraEnv,
      HOME: agentHome,
      PATH: [
        Deno.env.get("PATH") ?? "",
        `${realHome}/.local/bin`,
        `${realHome}/.deno/bin`,
        "/usr/local/bin",
      ].join(":"),
      // Prevent Claude Code from refusing to run inside another Claude Code
      // session. The daemon may inherit this env var when started from a
      // developer's terminal that already has Claude Code running.
      CLAUDECODE: "",
    };

    if (this.#opts.proxyUrl && this.#opts.proxyToken) {
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
            // Refresh daemon .netrc (full token)
            await setupGitHubAppNetrc(
              this.#repoInfo.owner,
              this.#repoInfo.repo,
            );
            // Mint a fresh restricted token for the agent files
            newToken = await mintScopedToken(
              this.#repoInfo.owner,
              this.#repoInfo.repo,
              AGENT_PERMISSIONS,
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

      // Subscribe to PTY output to capture Claude Code's OAuth login URL.
      // Claude Code prints something like:
      //   "To sign in, visit: https://claude.ai/oauth/authorize?..."
      // when started without an API key.
      // We accumulate output in a buffer so that URLs split across PTY chunks
      // are still matched reliably.
      this.#session.onData((data) => {
        if (this.#loginUrl) return; // already found
        // Strip ANSI escape sequences for reliable URL matching
        this.#stdoutBuffer += data.replace(/\x1b\[[0-9;]*[mGKHF]/g, "");
        // Keep the buffer bounded — the URL appears early in the output and
        // we only need enough context to span a split chunk boundary.
        if (this.#stdoutBuffer.length > 4096) {
          this.#stdoutBuffer = this.#stdoutBuffer.slice(-4096);
        }
        // Require the URL to be followed by actual whitespace so we don't
        // capture a partial URL when a chunk boundary falls mid-URL.
        // Using (?=\s) instead of (?=\s|$) prevents matching at end-of-buffer,
        // which would be indistinguishable from a truncated chunk.
        const match = this.#stdoutBuffer.match(
          /https:\/\/claude\.ai\/oauth\/authorize\S*(?=\s)/,
        );
        if (match) {
          this.#loginUrl = match[0].trim().replace(/[)\]'"]+$/, "");
          console.log(`[ai] Task ${this.taskId}: captured login URL`);
          this.#stdoutBuffer = ""; // release memory
        }
      });

      this.#session.onExit((code) => {
        this.#onComplete(code).catch((err) => {
          console.error(`[ai] Post-completion failed:`, err);
        });
      });

      // Keep the environment from being considered idle while the task runs.
      // The HTTP activity monitor only fires on requests; a long-running AI
      // task produces no traffic, so reset immediately and then every 30 s.
      resetActivity();
      this.#activityInterval = setInterval(() => {
        resetActivity();
      }, 30_000);
    } catch (err) {
      this.#status = "failed";
      if (this.#tokenRefreshInterval) {
        clearInterval(this.#tokenRefreshInterval);
        this.#tokenRefreshInterval = null;
      }
      throw err;
    }
  }

  async #commitChanges(): Promise<void> {
    using _ = await lockerGitAPI.lock.wlock();
    const env = gitEnv(this.#githubToken ?? undefined);

    // Check for uncommitted changes (staged or unstaged)
    const statusCmd = new Deno.Command("git", {
      args: ["status", "--porcelain"],
      cwd: this.#opts.cwd,
      stdout: "piped",
      stderr: "piped",
      env,
    });
    const statusOutput = await statusCmd.output();
    const hasChanges = statusOutput.success &&
      new TextDecoder().decode(statusOutput.stdout).trim().length > 0;

    if (!hasChanges) {
      console.log(`[ai] Task ${this.taskId}: no uncommitted changes to commit`);
      return;
    }

    const addCmd = new Deno.Command("git", {
      args: ["add", "-A"],
      cwd: this.#opts.cwd,
      stdout: "piped",
      stderr: "piped",
      env,
    });
    const addOutput = await addCmd.output();
    if (!addOutput.success) {
      console.error(
        `[ai] Task ${this.taskId}: git add failed: ${
          new TextDecoder().decode(addOutput.stderr)
        }`,
      );
      return;
    }

    // Unstage .agent-home so token files are never committed
    const unstageCmd = new Deno.Command("git", {
      args: ["reset", "--", ".agent-home"],
      cwd: this.#opts.cwd,
      stdout: "piped",
      stderr: "piped",
      env,
    });
    await unstageCmd.output(); // best-effort; .agent-home may not exist

    const commitCmd = new Deno.Command("git", {
      args: [
        "commit",
        "-m",
        `chore: apply AI task changes [${this.taskId}]`,
      ],
      cwd: this.#opts.cwd,
      stdout: "piped",
      stderr: "piped",
      env,
    });
    const commitOutput = await commitCmd.output();
    if (!commitOutput.success) {
      console.error(
        `[ai] Task ${this.taskId}: git commit failed: ${
          new TextDecoder().decode(commitOutput.stderr)
        }`,
      );
      return;
    }

    console.log(`[ai] Task ${this.taskId}: uncommitted changes committed`);

    // Get current branch name
    const branchCmd = new Deno.Command("git", {
      args: ["rev-parse", "--abbrev-ref", "HEAD"],
      cwd: this.#opts.cwd,
      stdout: "piped",
      stderr: "piped",
      env,
    });
    const branchOutput = await branchCmd.output();
    if (!branchOutput.success) {
      console.error(`[ai] Task ${this.taskId}: failed to get branch name`);
      return;
    }
    const branch = new TextDecoder().decode(branchOutput.stdout).trim();

    const pushCmd = new Deno.Command("git", {
      args: ["push", "-u", "origin", branch],
      cwd: this.#opts.cwd,
      stdout: "piped",
      stderr: "piped",
      env,
    });
    const pushOutput = await pushCmd.output();
    if (!pushOutput.success) {
      console.error(
        `[ai] Task ${this.taskId}: git push failed: ${
          new TextDecoder().decode(pushOutput.stderr)
        }`,
      );
    } else {
      console.log(`[ai] Task ${this.taskId}: changes pushed to ${branch}`);
    }
  }

  async #onComplete(exitCode: number): Promise<void> {
    const success = exitCode === 0;
    this.#status = success ? "completed" : "failed";

    // Stop the token refresh and activity intervals — task is done
    if (this.#tokenRefreshInterval) {
      clearInterval(this.#tokenRefreshInterval);
      this.#tokenRefreshInterval = null;
    }
    if (this.#activityInterval) {
      clearInterval(this.#activityInterval);
      this.#activityInterval = null;
    }

    console.log(
      `[ai] Task ${this.taskId} exited with code ${exitCode}`,
    );

    // Skip all post-exit side-effects if the task was disposed
    if (this.#disposed) return;

    // Commit any uncommitted changes left by Claude if requested
    if (this.#opts.shouldCommitChanges === true) {
      await this.#commitChanges();
    }

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
      loginUrl: this.#loginUrl,
      createdAt: this.createdAt,
    };
  }

  dispose(): void {
    this.#disposed = true;
    if (this.#tokenRefreshInterval) {
      clearInterval(this.#tokenRefreshInterval);
      this.#tokenRefreshInterval = null;
    }
    if (this.#activityInterval) {
      clearInterval(this.#activityInterval);
      this.#activityInterval = null;
    }
    if (this.#session) {
      this.#session.dispose();
    }
  }
}
