import * as semver from "@std/semver";
import { lookup, REGISTRIES, type RegistryUrl } from "../utils/registry.ts";

export interface PackageInfo {
  url: RegistryUrl;
  versions: {
    current: string;
    latest?: string;
  };
}

function eligibleLatestVersion(versions: string[], allowPre = false) {
  return allowPre
    ? versions[0]
    : versions.find((ver) => semver.parse(ver)?.prerelease?.length === 0);
}

export const pkgInfo = async (
  importUrl: string,
  allowPre = false,
): Promise<PackageInfo | undefined> => {
  const url = lookup(importUrl, REGISTRIES);

  if (!url) return;

  const versions = await url.all();
  const current = url.version();
  const latest = eligibleLatestVersion(versions, allowPre);
  return {
    url,
    versions: {
      current,
      latest,
    },
  };
};
