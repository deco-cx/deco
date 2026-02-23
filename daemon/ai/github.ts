export interface IssueContext {
  owner: string;
  repo: string;
  number: number;
  title: string;
  body: string;
  labels: string[];
  comments: Array<{ author: string; body: string }>;
}

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

export async function fetchIssue(
  url: string,
  token: string,
): Promise<IssueContext> {
  const { owner, repo, number } = parseIssueUrl(url);
  const nwo = `${owner}/${repo}`;

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
    console.error(`[ai] gh pr create failed: ${stderr}`);
    return null;
  }

  const prUrlMatch = stdout.match(
    /https:\/\/github\.com\/[^\s]+\/pull\/\d+/,
  );
  return prUrlMatch ? prUrlMatch[0] : stdout;
}

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
    console.error(`[ai] gh issue comment failed: ${stderr}`);
  }
}
