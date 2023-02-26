import { exec, OutputMode } from "https://deno.land/x/exec@0.0.5/mod.ts";
import { increment } from "std/semver/mod.ts";
import { Select } from "https://deno.land/x/cliffy@v0.25.5/prompt/mod.ts";

await exec("git fetch --tags");

const response = await exec(`bash -c "git tag | sort -V | tail -1"`, {
  output: OutputMode.Capture,
});

const latestTag = response.output;

console.log(`Current version is: ${latestTag}`);

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

const GIT_TAG_COMMAND = `git tag ${newVersion}`;
console.log(`Running \`${GIT_TAG_COMMAND}\``);

await exec(GIT_TAG_COMMAND);

const GIT_PUSH_TAGS_COMMAND = `git push --tags`;
console.log(`Running \`${GIT_PUSH_TAGS_COMMAND}\``);

await exec(GIT_PUSH_TAGS_COMMAND);
