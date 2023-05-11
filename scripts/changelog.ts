import { Octokit } from "https://cdn.skypack.dev/@octokit/rest@19.0.4";
import { blue, bold } from "https://deno.land/std@0.181.0/fmt/colors.ts";
import * as semver from "https://deno.land/x/semver@v1.4.1/mod.ts";
import { Endpoints } from "https://esm.sh/@octokit/types@9.0.0";

const _client = new Octokit();

/**
 * Prints the difference since the @param ver and the latest version.
 */
export const printDiff = async (ver: semver.SemVer, ownerRepo: string) => {
  const [owner, repo] = ownerRepo.split("/");
  const { data } = await _client.request(
    "GET /repos/{owner}/{repo}/releases",
    { owner, repo },
  ) as Endpoints["GET /repos/{owner}/{repo}/releases"][
    "response"
  ];

  for (const release of data) {
    const version = semver.parse(release.tag_name);
    if (!version) {
      continue;
    }
    const diff = version.compare(ver) ?? 0;
    if (diff > 0) {
      console.log(bold(blue(`v${version.toString()}`)));
      console.log(bold(release.body ?? ""));
    }
  }
};
