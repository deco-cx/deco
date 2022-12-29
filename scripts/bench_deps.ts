import {
  mean,
  median,
  percentile,
  sum,
} from "https://esm.sh/stats-lite@2.2.0?pin=v102";
import { prettyBytes } from "https://deno.land/x/pretty_bytes@v2.0.0/mod.ts";

console.log(
  "Simple deps benchmark for deno. Use `deno info --json main.ts > deps.json` to generate the data.\nCall this script with first param as the deps.json file path.",
);

const deps = JSON.parse(await Deno.readTextFile(Deno.args[1]));

const parseSpecifier = (specifier: string) => {
  const { host, pathname, search, protocol } = new URL(specifier);
  const pwd = Deno.cwd();

  if (protocol === "file:" && pathname.startsWith(pwd)) {
    const [module, path] = pathname.slice(pwd.length + 1).split("/");
    return {
      host,
      module,
      path,
      search,
    };
  }

  const esmVersion = host === "esm.sh" && pathname.startsWith("/v") &&
    pathname.split("/")[1];
  const remaining = esmVersion
    ? pathname.split("/").slice(2).join("/")
    : pathname.replace(/\/\-\//, "");
  const [, module, version, path] = remaining.match(/(.*)(@[\d.\-\w]*)(.*)/) ||
    [];

  return {
    host,
    module: module?.replace(/(\/x\/)?\/?/, ""),
    version: version ? version.slice(1) : version,
    path: path || remaining,
    search,
    esmVersion,
  };
};

type StatModule = {
  size: number;
  files: number;
};

type Parsed = {
  host: string;
  module: string;
  path: string;
  search: string;
  version?: undefined;
  esmVersion?: undefined;
} | {
  host: string;
  module: string;
  version: string;
  path: string;
  search: string;
  esmVersion: string | false;
};

type Module = {
  specifier: string;
  parsed?: Parsed;
  dependencies?: Module[];
};

const userModules: Record<string, StatModule> = {};
const depModules: Record<string, StatModule> = {};

for (let i = 0; i < deps.modules.length; i++) {
  const dep = deps.modules[i];
  const parsed = parseSpecifier(dep.specifier);
  if (!parsed) {
    continue;
  }
  dep.parsed = parsed;
  const { module, version, esmVersion, path, search } = parsed;

  if (!version) {
    const locator = `${module}`;

    if (!userModules[locator]) {
      userModules[locator] = {
        size: dep.size,
        files: 1,
      };
    } else {
      userModules[locator].size += dep.size;
      userModules[locator].files += 1;
    }
    continue;
  }

  const locator = `${esmVersion ? `${esmVersion}/` : ""}${module}@${version}`;

  if (!depModules[locator]) {
    depModules[locator] = {
      size: dep.size,
      files: 1,
    };
  } else {
    depModules[locator].size += dep.size;
    depModules[locator].files += 1;
  }
}

const sizes = Object.values(depModules).map((m) => m.size || 0);
const files = Object.values(depModules).map((m) => m.files);
const sizeSum = sum(sizes);
const sizeMean = mean(sizes);
const sizeMedian = median(sizes);
const sizePercentile = percentile(sizes, 0.95);
const sizeMax = Math.max(...sizes);
const fileSum = sum(files);
const fileMax = Math.max(...files);
const filePercentile = percentile(files, 0.95);

const userSizes = Object.values(userModules).map((m) => m.size || 0);
const userFiles = Object.values(userModules).map((m) => m.files);
const userSizeSum = sum(userSizes);
const userFileSum = sum(userFiles);

const dependsOn = (module: string) => {
  const dependsOnSet = new Set<string>();
  deps.modules.forEach((m: Module) => {
    const mDeps: Module[] = m.dependencies || [];
    if (
      mDeps.some((d: Module) => d.specifier.includes(module)) &&
      m.parsed!.module !== module
    ) {
      dependsOnSet.add(
        `${m.parsed!.esmVersion ? `${m.parsed!.esmVersion}/` : ""}${
          m.parsed!.module
        }${m.parsed!.version ? `@${m.parsed!.version}` : ""}`,
      );
    }
  });
  // Return only unique values
  return [...dependsOnSet];
};

const entryToRow = ([k, m]: [string, StatModule]) => ({
  module: k.substring(0, 30),
  bytes: prettyBytes(m.size),
  "size (%)": (m.size / sizeSum).toLocaleString(undefined, {
    style: "percent",
    minimumFractionDigits: 2,
    minimumIntegerDigits: 2,
  }),
  files: m.files,
  "files (%)": (m.files / fileSum).toLocaleString(undefined, {
    style: "percent",
    minimumFractionDigits: 2,
    minimumIntegerDigits: 2,
  }),
});

console.log("\n>>> Userland");

console.table([
  { label: `Total size`, value: prettyBytes(userSizeSum) },
  { label: `Total files`, value: userFileSum },
]);

console.log("\n>>> Dependencies");

console.table([
  { label: `Total size`, value: prettyBytes(sizeSum) },
  { label: `Mean size`, value: prettyBytes(sizeMean) },
  { label: `Median size`, value: prettyBytes(sizeMedian) },
  { label: `p95 size`, value: prettyBytes(sizePercentile) },
  { label: `Max size`, value: prettyBytes(sizeMax) },
  { label: `Total files`, value: fileSum },
  { label: `Max files`, value: fileMax },
  { label: `p95 files`, value: Math.floor(filePercentile) },
]);

const largestDeps = Object.entries(depModules).filter(([_, m]) =>
  m.size >= sizePercentile
);
largestDeps.sort(([_, a], [__, b]) => b.size - a.size);
console.log(`\nLargest deps (> p95):`);
console.table(largestDeps.map(entryToRow));

const largestFileDeps = Object.entries(depModules).filter(([_, m]) =>
  m.files >= filePercentile
);
largestFileDeps.sort(([_, a], [__, b]) => b.files - a.files);
console.log(`\nDependencies with most files (> p95):`);
console.table(largestFileDeps.map(entryToRow));

console.log("\n>>> Top offenders and who depends on them:\n");

const allOffenders = new Set<string>();
largestDeps.forEach(([k]) => allOffenders.add(k));
largestFileDeps.forEach(([k]) => allOffenders.add(k));
const offenders = [...allOffenders].sort();

for (const offender of offenders) {
  console.log(offender);
  console.log(dependsOn(offender));
  console.log("\n");
}
