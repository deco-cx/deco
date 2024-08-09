import { blue, bold } from "@std/fmt/colors";
import * as semver from "@std/semver";
import { Octokit } from "npm:@octokit/rest@19.0.4";
import type { Endpoints } from "npm:@octokit/types@9.0.0";

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
    if (semver.lessThan(version, ver)) {
      console.log(bold(blue(`v${version.toString()}`)));
      console.log(bold(release.body ?? ""));
    }
  }
};
