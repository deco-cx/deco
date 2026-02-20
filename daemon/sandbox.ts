import type { Handler } from "@hono/hono";
import { getSiteName, resetSiteName, setSiteName } from "./daemon.ts";

/**
 * Extracts a site name from a git repository URL.
 * e.g. "https://github.com/org/my-repo.git" → "my-repo"
 *      "git@github.com:org/my-repo.git"     → "my-repo"
 */
const siteNameFromRepo = (repo: string): string => {
  const name = repo.split("/").pop()?.replace(/\.git$/, "");
  if (!name) {
    throw new Error(`Cannot derive site name from repo URL: ${repo}`);
  }
  return name;
};

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

interface DeployResult {
  domain?: string;
}

interface SandboxOptions {
  onDeploy: (params: DeployParams) => Promise<DeployResult>;
  onUndeploy: () => Promise<void>;
}

interface SandboxHandlers {
  status: Handler;
  deploy: Handler;
  undeploy: Handler;
}

export type { DeployParams };

export const createSandboxHandlers = (
  { onDeploy, onUndeploy }: SandboxOptions,
): SandboxHandlers => {
  let deploying = false;

  const status: Handler = (c) => {
    const site = getSiteName();
    return c.json({
      sandbox: true,
      deployed: !!site,
      deploying: deploying && !site,
      site,
    });
  };

  const deploy: Handler = async (c) => {
    if (getSiteName() || deploying) {
      return c.json({ error: "Already deployed" }, 409);
    }
    deploying = true;

    let body: {
      repo?: string;
      site?: string;
      envName?: string;
      branch?: string;
      runCommand?: string[];
      envs?: Record<string, string>;
      task?: { issue?: string; prompt?: string };
    };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const { repo, site: siteOverride, envName, runCommand, envs } = body;

    if (repo !== undefined && typeof repo !== "string") {
      return c.json({ error: "repo must be a string" }, 400);
    }

    if (siteOverride !== undefined && typeof siteOverride !== "string") {
      return c.json({ error: "site must be a string" }, 400);
    }

    if (!repo && !siteOverride) {
      return c.json(
        { error: "At least one of 'repo' or 'site' is required" },
        400,
      );
    }

    if (envName !== undefined && typeof envName !== "string") {
      return c.json({ error: "envName must be a string" }, 400);
    }

    if (body.branch !== undefined && typeof body.branch !== "string") {
      return c.json({ error: "branch must be a string" }, 400);
    }

    if (
      runCommand &&
      (!Array.isArray(runCommand) ||
        !runCommand.every((s) => typeof s === "string"))
    ) {
      return c.json({ error: "runCommand must be a string array" }, 400);
    }

    if (
      envs !== undefined &&
      (typeof envs !== "object" || envs === null || Array.isArray(envs) ||
        !Object.values(envs).every((v) => typeof v === "string"))
    ) {
      return c.json(
        { error: "envs must be an object with string values" },
        400,
      );
    }

    // Derive site name from repo URL if not explicitly provided
    // At this point, at least one of repo/siteOverride is guaranteed to exist
    const site = siteOverride ?? siteNameFromRepo(repo as string);

    let result: DeployResult;
    try {
      result = await onDeploy({
        repo,
        site,
        envName,
        branch: body.branch,
        runCommand,
        envs,
        task: body.task,
      });
    } catch (err) {
      deploying = false;
      console.error(`[sandbox] Deploy failed:`, err);
      return c.json({ error: "Deploy failed" }, 500);
    }

    setSiteName(site);

    const url = result.domain ? `https://${result.domain}` : undefined;

    console.log(
      `[sandbox] Deployed site: ${site}${repo ? ` from repo: ${repo}` : ""}${
        runCommand ? ` with command: ${runCommand.join(" ")}` : ""
      }${url ? ` at ${url}` : ""}`,
    );

    return c.json({ ok: true, site, url });
  };

  const undeploy: Handler = async (c) => {
    const site = getSiteName();
    if (!site) {
      return c.json({ error: "Not deployed" }, 409);
    }

    console.log(`[sandbox] Undeploying site: ${site}`);

    try {
      await onUndeploy();
    } catch (err) {
      console.error(`[sandbox] Undeploy failed:`, err);
      return c.json({ error: "Undeploy failed" }, 500);
    } finally {
      resetSiteName();
      deploying = false;
    }

    console.log(`[sandbox] Undeployed. Ready for new deploy.`);

    return c.json({ ok: true });
  };

  return { status, deploy, undeploy };
};
