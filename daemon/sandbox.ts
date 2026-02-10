import type { Handler } from "@hono/hono";
import { getSiteName, resetSiteName, setSiteName } from "./daemon.ts";

interface DeployParams {
  site: string;
  runCommand?: string[];
}

interface SandboxOptions {
  onDeploy: (params: DeployParams) => void;
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
  const status: Handler = (c) => {
    const site = getSiteName();
    return c.json({
      sandbox: true,
      deployed: !!site,
      site: site ?? undefined,
    });
  };

  const deploy: Handler = async (c) => {
    if (getSiteName()) {
      return c.json({ error: "Already deployed" }, 409);
    }

    let body: { site?: string; runCommand?: string[] };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const { site, runCommand } = body;
    if (!site || typeof site !== "string") {
      return c.json({ error: "Missing required field: site" }, 400);
    }

    if (runCommand && !Array.isArray(runCommand)) {
      return c.json({ error: "runCommand must be a string array" }, 400);
    }

    setSiteName(site);
    onDeploy({ site, runCommand });

    console.log(
      `[sandbox] Deployed as site: ${site}${
        runCommand ? ` with command: ${runCommand.join(" ")}` : ""
      }`,
    );

    return c.json({ ok: true, site });
  };

  const undeploy: Handler = async (c) => {
    const site = getSiteName();
    if (!site) {
      return c.json({ error: "Not deployed" }, 409);
    }

    console.log(`[sandbox] Undeploying site: ${site}`);

    await onUndeploy();
    resetSiteName();

    console.log(`[sandbox] Undeployed. Ready for new deploy.`);

    return c.json({ ok: true });
  };

  return { status, deploy, undeploy };
};
