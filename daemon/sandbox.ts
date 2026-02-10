import type { Handler } from "@hono/hono";
import { getSiteName, resetSiteName, setSiteName } from "./daemon.ts";

interface DeployParams {
  site: string;
  envName?: string;
  runCommand?: string[];
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
      site: site ?? undefined,
    });
  };

  const deploy: Handler = async (c) => {
    if (getSiteName() || deploying) {
      return c.json({ error: "Already deployed" }, 409);
    }
    deploying = true;

    let body: { site?: string; envName?: string; runCommand?: string[] };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const { site, envName, runCommand } = body;
    if (!site || typeof site !== "string") {
      return c.json({ error: "Missing required field: site" }, 400);
    }

    if (
      runCommand &&
      (!Array.isArray(runCommand) ||
        !runCommand.every((s) => typeof s === "string"))
    ) {
      return c.json({ error: "runCommand must be a string array" }, 400);
    }

    let result: DeployResult;
    try {
      result = await onDeploy({ site, envName, runCommand });
    } catch (err) {
      deploying = false;
      console.error(`[sandbox] Deploy failed:`, err);
      return c.json({ error: "Deploy failed" }, 500);
    }

    setSiteName(site);

    const url = result.domain ? `https://${result.domain}` : undefined;

    console.log(
      `[sandbox] Deployed as site: ${site}${
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

    await onUndeploy();
    resetSiteName();
    deploying = false;

    console.log(`[sandbox] Undeployed. Ready for new deploy.`);

    return c.json({ ok: true });
  };

  return { status, deploy, undeploy };
};
