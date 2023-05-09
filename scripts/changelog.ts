import {
  brightBlue,
  brightGreen,
  brightRed,
  brightYellow,
  gray,
} from "https://deno.land/std@0.181.0/fmt/colors.ts";
import { join } from "https://deno.land/std@0.181.0/path/mod.ts";
import { parser, Release } from "https://deno.land/x/changelog@v2.0.0/mod.ts";

export const CHANGELOG_FILE_PATH = join(Deno.cwd(), "CHANGELOG.md");

const getChangelog = async () =>
  parser(await Deno.readTextFile(CHANGELOG_FILE_PATH));

/**
 * Releases a new changelog version and creates the `Unreleased` section.
 * @param ver
 */
export const releaseVer = async (ver: string) => {
  const changelog = await getChangelog();
  const latest = changelog.releases[0];
  latest.setVersion(ver);
  latest.setDate(new Date());
  await Deno.writeTextFile(
    CHANGELOG_FILE_PATH,
    changelog.addRelease(new Release()).toString(),
  );
};

const colorByChange: Record<string, (str: string) => string> = {
  "changed": brightYellow,
  "added": brightGreen,
  "deprecated": gray,
  "removed": brightRed,
  "fixed": brightBlue,
  "security": brightYellow,
};
const capitalize = (str: string) => str[0].toUpperCase() + str.substring(1);

/**
 * Prints the difference between the @param ver and the latest version.
 */
export const printDiff = (ver: string, changelogStr: string) => {
  const chlog = parser(changelogStr);
  chlog.sortReleases();

  for (const release of chlog.releases) {
    const diff = release.version?.compare(ver) ?? 0;
    if (diff > 0) {
      console.log(brightBlue(`v${release!.version!.toString()}`));
      for (const change of release.changes) {
        if (change[1].length > 0) {
          console.log(`# ${capitalize(change[0])}`);
          for (const ch of change[1]) {
            console.log(
              (colorByChange[change[0]] ?? brightGreen)(` - ${ch.title}`),
            );
          }
          console.log();
        }
      }
    }
  }
};
