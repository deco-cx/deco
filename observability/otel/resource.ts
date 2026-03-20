import { Context, context } from "../../deco.ts";
import denoJSON from "../../deno.json" with { type: "json" };
import { Resource, SemanticResourceAttributes } from "../../deps.ts";
import { ENV_SITE_NAME } from "../../engine/decofile/constants.ts";
import { safeImportResolve } from "../../engine/importmap/builder.ts";

const tryGetVersionOf = (pkg: string) => {
  try {
    const [_, ver] = safeImportResolve(pkg).split("@");
    return ver.substring(0, ver.length - 1);
  } catch {
    return undefined;
  }
};
const apps_ver = tryGetVersionOf("apps/") ??
  tryGetVersionOf("deco-sites/std/") ?? "_";

export const OTEL_IS_ENABLED: boolean = Deno.env.has(
  "OTEL_EXPORTER_OTLP_ENDPOINT",
);

export const resource = Resource.default().merge(
  new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: Deno.env.get(ENV_SITE_NAME) ??
      "deco",
    [SemanticResourceAttributes.SERVICE_VERSION]:
      Context.active().deploymentId ??
        Deno.hostname(),
    [SemanticResourceAttributes.SERVICE_INSTANCE_ID]: crypto.randomUUID(),
    [SemanticResourceAttributes.CLOUD_PROVIDER]: context.platform,
    "deco.runtime.version": denoJSON.version,
    "deco.apps.version": apps_ver,
    [SemanticResourceAttributes.CLOUD_REGION]: Deno.env.get("DENO_REGION") ??
      "unknown",
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: Deno.env.get(
        "DECO_ENV_NAME",
      )
      ? `env-${Deno.env.get("DECO_ENV_NAME")}`
      : "production",
  }),
);
