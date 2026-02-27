// TODO: @gimenes use redirect instead of serving this file

const packageName = "@deco/deco";

const getVersionFromDenoJson = async (): Promise<string> => {
  try {
    const denoJsonPath = `${Deno.cwd()}/deno.json`;
    const denoJson = JSON.parse(await Deno.readTextFile(denoJsonPath));
    const imports = denoJson.imports ?? {};

    // Try @deco/deco first, then @deco/dev
    const specifier = imports["@deco/deco"] ?? imports["@deco/dev"];

    if (!specifier || !specifier.startsWith("jsr:")) {
      console.warn("No jsr specifier found, falling back to major version");
      return "1";
    }

    // Extract version from jsr:@deco/deco@1.133.2 or jsr:@deco/dev@1.133.4
    const match = specifier.match(/@([^@]+)$/);
    if (!match) {
      console.warn("Could not parse version from specifier, falling back to major version");
      return "1";
    }

    const version = match[1].replace(/^\^/, ""); // Remove ^ if present
    console.log(`%cusing version ${version} from deno.json`, "color: gray");
    return version;
  } catch (err) {
    console.warn("Could not read deno.json", err, "falling back to major version");
    return "1";
  }
};

const version = await getVersionFromDenoJson();

await import(`jsr:${packageName}@${version}/scripts/run`);
