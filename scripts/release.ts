import { join } from "https://cdn.jsdelivr.net/gh/denoland/deno_std@0.181.0/path/mod.ts";
import { increment } from "https://cdn.jsdelivr.net/gh/denoland/deno_std@0.181.0/semver/mod.ts";
import { Select } from "https://cdn.jsdelivr.net/gh/c4spar/deno-cliffy/prompt/mod.ts";
import {
  exec,
  OutputMode,
} from "https://cdn.jsdelivr.net/gh/gpasq/deno-exec@0.0.5/mod.ts";

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

const response = await exec(`bash -c "git tag | sort -V | tail -1"`, {
  output: OutputMode.Capture,
});

const latestTag = response.output;

console.log(`Current version is: ${latestTag}`);

// TODO: Only allow releases in main branch

const patchIncrement = increment(latestTag, "patch") || "";
const minorIncrement = increment(latestTag, "minor") || "";
const majorIncrement = increment(latestTag, "major") || "";

const newVersionByUser = await Select.prompt({
  options: [
    { value: patchIncrement, name: `Patch (${patchIncrement})` },
    {
      value: minorIncrement,
      name: `Minor (${minorIncrement})`,
    },
    { value: majorIncrement, name: `Major (${majorIncrement})` },
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
    JSON.stringify({ ...meta, version: newVersion }, null, 2),
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
