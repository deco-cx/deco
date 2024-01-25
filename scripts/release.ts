import { Select } from "https://deno.land/x/cliffy@v0.25.5/prompt/mod.ts";
import { join } from "std/path/mod.ts";
import { format, increment, parse } from "std/semver/mod.ts";
import { stringifyForWrite } from "../utils/json.ts";
import { exec } from "./utils.ts";

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

const response = await exec(`bash -c "git tag | sort -V | tail -1"`);

const latestTag = parse(response);

console.log(`Current version is: ${latestTag}`);

// TODO: Only allow releases in main branch

const patchIncrement = format(increment(latestTag, "patch"), "full") || "";
const minorIncrement = format(increment(latestTag, "minor"), "full") || "";
const majorIncrement = format(increment(latestTag, "major"), "full") || "";

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

let shouldCommit = false;
const metaJSONFilePath = join(Deno.cwd(), "meta.json");
if (await exists(metaJSONFilePath)) {
  const meta: { version: string } = await Deno.readTextFile(
    metaJSONFilePath,
  ).then(
    JSON.parse,
  );
  console.log(`Bumping meta.json`);

  await Deno.writeTextFile(
    metaJSONFilePath,
    stringifyForWrite({ ...meta, version: newVersion }),
  );

  const GIT_ADD_COMMAND = `git add ${metaJSONFilePath}`;
  console.log(`Running \`${GIT_ADD_COMMAND}\``);

  await exec(GIT_ADD_COMMAND);
  shouldCommit = true;
}

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
