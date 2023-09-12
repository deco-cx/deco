import { context } from "../mod.ts";
import meta from "../meta.json" assert { type: "json" };

export const defaultLabels = [
  "deployment_id",
  "site",
  "deco_ver",
  "apps_ver",
];

const tryGetVersionOf = (pkg: string) => {
  try {
    const [_, ver] = import.meta.resolve(pkg).split("@");
    return ver.substring(0, ver.length - 1);
  } catch {
    return undefined;
  }
};
const apps_ver = tryGetVersionOf("apps/") ??
  tryGetVersionOf("deco-sites/std/") ?? "_";

export const defaultLabelsValues = {
  deployment_id: context.deploymentId ?? Deno.hostname(),
  site: context.site,
  deco_ver: meta.version,
  apps_ver,
};
