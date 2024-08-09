import { Select } from "@cliffy/prompt";
import { join } from "@std/path";
import { format, increment, parse } from "@std/semver";
import { exec } from "./utils.ts";

/**
 * This script is used to release a new version of the project.
 * It will bump the version in the `deno.json` file and create a new tag.
 */

await exec("git fetch --tags");

const exists = async (dir: string): Promise<boolean> => {
  try {
    await Deno.stat(dir);
    // successful, file or directory must exist
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      // file or directory does not exist
      return false;
    } else {
      // unexpected error, maybe permissions, pass it along
      throw error;
    }
  }
};

const response = await exec(`git tag | sort -V | tail -1`);

const latestTag = parse(response.stdout);

console.log(
  `Current version is: ${latestTag.major}.${latestTag.minor}.${latestTag.patch}`,
);

// TODO: Only allow releases in main branch

const patchIncrement = format(increment(latestTag, "patch")) || "";
const minorIncrement = format(increment(latestTag, "minor")) || "";
const majorIncrement = format(increment(latestTag, "major")) || "";

const newVersionByUser = await Select.prompt({
  options: [
    {
      value: patchIncrement,
      name: `Patch (${patchIncrement})`,
    },
    {
      value: minorIncrement,
      name: `Minor (${minorIncrement})`,
    },
    {
      value: majorIncrement,
      name: `Major (${majorIncrement})`,
    },
    { value: "custom", name: "Custom" },
  ],
  message: "Select the bump you want to release: ",
});

const newVersion = newVersionByUser === "custom"
  ? prompt("Which version: ")
  : newVersionByUser;

const DENO_JSON_FILE_NAME = "deno.json";

let shouldCommit = false;
const bump = async (...denoJSONPaths: string[]) => {
  for (const denoJSONPath of denoJSONPaths) {
    if (await exists(denoJSONPath)) {
      const denoJSON: { version: string; workspace?: string[] } = await Deno
        .readTextFile(
          denoJSONPath,
        ).then(
          JSON.parse,
        );
      console.log(`Bumping ${denoJSONPath}`);

      await Deno.writeTextFile(
        denoJSONPath,
        `${JSON.stringify({ ...denoJSON, version: newVersion }, null, 2)}\n`,
      );

      const GIT_ADD_COMMAND = `git add ${denoJSONPath}`;
      console.log(`Running \`${GIT_ADD_COMMAND}\``);

      await exec(GIT_ADD_COMMAND);
      const newPaths = ["./scripts/"].map((path) =>
        join(Deno.cwd(), path, DENO_JSON_FILE_NAME)
      );
      // FIXME this should follow workspace spec but currently files inside workspace is being ignored.
      // denoJSON.workspace?.map((path) =>
      //   join(Deno.cwd(), path, DENO_JSON_FILE_NAME)
      // ) ?? [];
      await bump(...newPaths);

      shouldCommit = true;
    }
  }
};

const denoJSONFilePath = join(Deno.cwd(), DENO_JSON_FILE_NAME);
await bump(denoJSONFilePath);

if (shouldCommit) {
  const GIT_COMMIT_COMMAND = `git commit -m "Release [${newVersion}]" -n`;
  console.log(`Running \`${GIT_COMMIT_COMMAND}\``);

  await exec(GIT_COMMIT_COMMAND);

  const GIT_PUSH_COMMAND = `git push origin main`;
  console.log(`Running \`${GIT_PUSH_COMMAND}\``);

  await exec(GIT_PUSH_COMMAND);
}

const GIT_TAG_COMMAND = `git tag ${newVersion}`;
console.log(`Running \`${GIT_TAG_COMMAND}\``);

await exec(GIT_TAG_COMMAND);

const GIT_PUSH_TAGS_COMMAND = `git push --tags`;
console.log(`Running \`${GIT_PUSH_TAGS_COMMAND}\``);

await exec(GIT_PUSH_TAGS_COMMAND);
