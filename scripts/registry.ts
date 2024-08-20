// copied from https://deno.land/x/udd@0.8.2
// under MIT License.

export type RegistryCtor = new (url: string) => RegistryUrl;
export function lookup(url: string, registries: RegistryCtor[] = REGISTRIES):
  | RegistryUrl
  | undefined {
  for (const R of registries) {
    const u = new R(url);
    if (u.regexp.test(url)) {
      return u;
    }
  }
}

export interface RegistryUrl {
  url: string;
  // all versions of the url
  all: () => Promise<string[]>;
  // url at a given version
  at(version: string): RegistryUrl;
  // current version of url
  version: () => string;
  // is url valid for this RegistryUrl
  regexp: RegExp;
}

export function defaultAt(that: RegistryUrl, version: string): string {
  return that.url.replace(/@(.*?)(\/|$)/, `@${version}/`);
}

export function defaultVersion(that: RegistryUrl): string {
  const v = that.url.match(/\@([^\/]+)[\/$]?/);
  if (v === null) {
    throw Error(`Unable to find version in ${that.url}`);
  }
  return v[1];
}

export function defaultName(that: RegistryUrl): string {
  const n = that.url.match(/([^\/\"\']*?)\@[^\'\"]*/);
  if (n === null) {
    throw new Error(`Package name not found in ${that.url}`);
  }
  return n[1];
}

async function githubDownloadReleases(
  owner: string,
  repo: string,
  lastVersion: string | undefined = undefined,
): Promise<string[]> {
  let url = `https://github.com/${owner}/${repo}/releases.atom`;
  if (lastVersion) {
    url += `?after=${lastVersion}`;
  }
  // FIXME do we need to handle 404?

  const page = await fetch(url);
  const text = await page.text();
  return [
    ...text.matchAll(
      /\<id\>tag\:github\.com\,2008\:Repository\/\d+\/(.*?)\<\/id\>/g,
    ),
  ].map((x) => x[1]);
}

// export for testing purposes
// FIXME this should really be lazy, we shouldn't always iterate everything...
export const GR_CACHE: Map<string, string[]> = new Map<string, string[]>();
async function githubReleases(
  owner: string,
  repo: string,
  cache: Map<string, string[]> = GR_CACHE,
): Promise<string[]> {
  const cacheKey = `${owner}/${repo}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)!;
  }
  const versions = await githubDownloadReleases(owner, repo);
  if (versions.length === 10) {
    let lastVersion: string | undefined = undefined;
    // arbitrarily we're going to limit to 5 pages...?
    let i = 0;
    while (lastVersion !== versions[versions.length - 1] && i < 5) {
      i++;
      lastVersion = versions[versions.length - 1];
      versions.push(
        ...await githubDownloadReleases(owner, repo, lastVersion),
      );
    }
  }
  cache.set(cacheKey, versions);
  return versions;
}

interface VersionsJson {
  latest?: string;
  versions?: string[];
}

const JSR_CACHE: Map<string, string[]> = new Map<string, string[]>();
export class Jsr implements RegistryUrl {
  url: string;
  parseRegex = /^jsr:(\/?\@[^/]+\/[^@/]+|\/?[^@/]+)(?:\@([^/]+))?(.*)/;

  constructor(url: string) {
    this.url = url;
  }

  name(): string {
    const [, name] = this.url.match(this.parseRegex)!;

    return name;
  }

  async all(): Promise<string[]> {
    const name = this.name();
    if (JSR_CACHE.has(name)) {
      return JSR_CACHE.get(name)!;
    }

    try {
      const json: VersionsJson =
        await (await fetch(`https://jsr.io/${name}/meta.json`))
          .json();
      if (!json.versions) {
        throw new Error(
          `versions.json for ${name} has incorrect format`,
        );
      }

      const versions = Object.keys(json.versions).sort().reverse();
      JSR_CACHE.set(name, versions);
      return versions;
    } catch (err) {
      // TODO this could be a permissions error e.g. no --allow-net...
      console.error(`error getting versions for ${name}`);
      throw err;
    }
  }

  at(version: string): RegistryUrl {
    const [, name, _, files] = this.url.match(this.parseRegex)!;
    const url = `jsr:${name}@${version}${files}`;
    return new Jsr(url);
  }
  files(): string {
    const [, _, __, files] = this.url.match(this.parseRegex)!;
    return `.${files ?? ""}`;
  }

  version(): string {
    const [, _, version] = this.url.match(this.parseRegex)!;
    if (version === null) {
      throw Error(`Unable to find version in ${this.url}`);
    }
    return version.startsWith("^") ? version.slice(1) : version;
  }

  regexp = /jsr:(\@[^/]+\/[^@/]+|[^@/]+)(?:\@([^\/\"\']+))?[^\'\"]/;
}

const DL_CACHE: Map<string, string[]> = new Map<string, string[]>();
export class DenoLand implements RegistryUrl {
  url: string;

  constructor(url: string) {
    this.url = url;
  }

  name(): string {
    const [, stdGroup, xGroup] = this.url.match(
      /deno\.land\/(?:(std)|x\/([^/@]*))/,
    )!;

    return stdGroup ?? xGroup;
  }

  async all(): Promise<string[]> {
    const name = this.name();
    if (DL_CACHE.has(name)) {
      return DL_CACHE.get(name)!;
    }

    try {
      const json: VersionsJson = await (await fetch(
        `https://cdn.deno.land/${name}/meta/versions.json`,
      ))
        .json();
      if (!json.versions) {
        throw new Error(
          `versions.json for ${name} has incorrect format`,
        );
      }

      DL_CACHE.set(name, json.versions);
      return json.versions;
    } catch (err) {
      // TODO this could be a permissions error e.g. no --allow-net...
      console.error(`error getting versions for ${name}`);
      throw err;
    }
  }

  at(version: string): RegistryUrl {
    const url = defaultAt(this, version);
    return new DenoLand(url);
  }

  version(): string {
    return defaultVersion(this);
  }

  regexp = /https?:\/\/deno.land\/(?:std\@[^\'\"]*|x\/[^\/\"\']*?\@[^\'\"]*)/;
}

const NPM_CACHE: Map<string, string[]> = new Map<string, string[]>();
export class Npm implements RegistryUrl {
  url: string;
  parseRegex = /^npm:(\@[^/]+\/[^@/]+|[^@/]+)(?:\@([^/]+))?(.*)/;

  constructor(url: string) {
    this.url = url;
  }

  name(): string {
    const [, name] = this.url.match(this.parseRegex)!;

    return name;
  }

  async all(): Promise<string[]> {
    const name = this.name();
    if (NPM_CACHE.has(name)) {
      return NPM_CACHE.get(name)!;
    }

    try {
      const json: VersionsJson =
        await (await fetch(`https://registry.npmjs.org/${name}`))
          .json();
      if (!json.versions) {
        throw new Error(
          `versions.json for ${name} has incorrect format`,
        );
      }

      const versions = Object.keys(json.versions).reverse();
      NPM_CACHE.set(name, versions);
      return versions;
    } catch (err) {
      // TODO this could be a permissions error e.g. no --allow-net...
      console.error(`error getting versions for ${name}`);
      throw err;
    }
  }

  at(version: string): RegistryUrl {
    const [, name, _, files] = this.url.match(this.parseRegex)!;
    const url = `npm:${name}@${version}${files}`;
    return new Npm(url);
  }

  version(): string {
    const [, _, version] = this.url.match(this.parseRegex)!;
    if (version === null) {
      throw Error(`Unable to find version in ${this.url}`);
    }
    return version;
  }

  regexp = /npm:(\@[^/]+\/[^@/]+|[^@/]+)(?:\@([^\/\"\']+))?[^\'\"]/;
}

async function unpkgVersions(name: string): Promise<string[]> {
  const page = await fetch(`https://unpkg.com/browse/${name}/`);
  const text = await page.text();
  // naively, we grab all the options
  const m = [...text.matchAll(/\<option[^\<\>]* value\=\"(.*?)\"\>/g)];
  m.reverse();
  return m.map((x) => x[1]);
}

interface PackageInfo {
  parts: string[];
  scope: string;
  packageName: string;
  version: string;
}
function defaultInfo(that: RegistryUrl): PackageInfo {
  const parts = that.url.split("/");
  const [packageName, version] = parts[4].split("@");
  if (parts[3] === undefined) {
    throw new Error(`Package scope not found in ${that.url}`);
  }
  if (packageName === undefined) {
    throw new Error(`Package name not found in ${that.url}`);
  }
  if (version === undefined) {
    throw new Error(`Unable to find version in ${that.url}`);
  }
  return {
    scope: parts[3],
    packageName,
    version,
    parts,
  };
}

function defaultScopeAt(that: RegistryUrl, version: string): string {
  const { parts, packageName } = defaultInfo(that);
  parts[4] = `${packageName}@${version}`;
  return parts.join("/");
}

export class UnpkgScope implements RegistryUrl {
  url: string;

  parts(): PackageInfo {
    return defaultInfo(this);
  }

  constructor(url: string) {
    this.url = url;
  }

  async all(): Promise<string[]> {
    const { scope, packageName } = this.parts();
    return await unpkgVersions(`${scope}/${packageName}`);
  }

  at(version: string): RegistryUrl {
    const url = defaultScopeAt(this, version);
    return new UnpkgScope(url);
  }

  version(): string {
    return this.parts().version;
  }

  regexp = /https?:\/\/unpkg\.com\/@[^\/\"\']*?\/[^\/\"\']*?\@[^\'\"]*/;
}

export class Unpkg implements RegistryUrl {
  url: string;

  name(): string {
    return defaultName(this);
  }

  constructor(url: string) {
    this.url = url;
  }

  async all(): Promise<string[]> {
    return await unpkgVersions(this.name());
  }

  at(version: string): RegistryUrl {
    const url = defaultAt(this, version);
    return new Unpkg(url);
  }

  version(): string {
    return defaultVersion(this);
  }

  regexp = /https?:\/\/unpkg.com\/[^\/\"\']*?\@[^\'\"]*/;
}

export class Jspm implements RegistryUrl {
  url: string;

  name(): string {
    return defaultName(this);
  }

  constructor(url: string) {
    this.url = url;
  }

  async all(): Promise<string[]> {
    return await unpkgVersions(this.name());
  }

  at(version: string): RegistryUrl {
    const url = defaultAt(this, version);
    return new Jspm(url);
  }

  version(): string {
    return defaultVersion(this);
  }

  regexp = /https?:\/\/dev.jspm.io\/[^\/\"\']*?\@[^\'\"]*/;
}

export class Denopkg implements RegistryUrl {
  url: string;

  owner(): string {
    return this.url.split("/")[3];
  }

  repo(): string {
    return defaultName(this);
  }

  constructor(url: string) {
    this.url = url;
  }

  async all(): Promise<string[]> {
    return await githubReleases(this.owner(), this.repo());
  }

  at(version: string): RegistryUrl {
    const url = defaultAt(this, version);
    return new Denopkg(url);
  }

  version(): string {
    return defaultVersion(this);
  }

  regexp = /https?:\/\/denopkg.com\/[^\/\"\']*?\/[^\/\"\']*?\@[^\'\"]*/;
}

export class PaxDenoDev implements RegistryUrl {
  url: string;

  owner(): string {
    return this.url.split("/")[3];
  }

  repo(): string {
    return defaultName(this);
  }

  constructor(url: string) {
    this.url = url;
  }

  async all(): Promise<string[]> {
    return await githubReleases(this.owner(), this.repo());
  }

  at(version: string): RegistryUrl {
    const url = defaultAt(this, version);
    return new PaxDenoDev(url);
  }

  version(): string {
    return defaultVersion(this);
  }

  regexp = /https?:\/\/pax.deno.dev\/[^\/\"\']*?\/[^\/\"\']*?\@[^\'\"]*/;
}

export class PikaScope implements RegistryUrl {
  url: string;

  parts(): PackageInfo {
    return defaultInfo(this);
  }

  constructor(url: string) {
    this.url = url;
  }

  async all(): Promise<string[]> {
    const { scope, packageName } = this.parts();
    return await unpkgVersions(`${scope}/${packageName}`);
  }

  at(version: string): RegistryUrl {
    const url = defaultScopeAt(this, version);
    return new PikaScope(url);
  }

  version(): string {
    return this.parts().version;
  }

  regexp =
    /https?:\/\/cdn\.pika\.dev(\/\_)?\/@[^\/\"\']*?\/[^\/\"\']*?\@[^\'\"]*/;
}

export class Pika implements RegistryUrl {
  url: string;

  name(): string {
    return defaultName(this);
  }

  constructor(url: string) {
    this.url = url;
  }

  async all(): Promise<string[]> {
    return await unpkgVersions(this.name());
  }

  at(version: string): RegistryUrl {
    const url = defaultAt(this, version);
    return new Pika(url);
  }

  version(): string {
    return defaultVersion(this);
  }

  regexp = /https?:\/\/cdn.pika.dev(\/\_)?\/[^\/\"\']*?\@[^\'\"]*/;
}

export class SkypackScope implements RegistryUrl {
  url: string;

  parts(): PackageInfo {
    return defaultInfo(this);
  }

  constructor(url: string) {
    this.url = url;
  }

  async all(): Promise<string[]> {
    const { scope, packageName } = this.parts();
    return await unpkgVersions(`${scope}/${packageName}`);
  }

  at(version: string): RegistryUrl {
    const url = defaultScopeAt(this, version);
    return new SkypackScope(url);
  }

  version(): string {
    return this.parts().version;
  }

  regexp =
    /https?:\/\/cdn\.skypack\.dev(\/\_)?\/@[^\/\"\']*?\/[^\/\"\']*?\@[^\'\"]*/;
}

export class Skypack implements RegistryUrl {
  url: string;

  name(): string {
    return defaultName(this);
  }

  constructor(url: string) {
    this.url = url;
  }

  async all(): Promise<string[]> {
    return await unpkgVersions(this.name());
  }

  at(version: string): RegistryUrl {
    const url = defaultAt(this, version);
    return new Skypack(url);
  }

  version(): string {
    return defaultVersion(this);
  }

  regexp = /https?:\/\/cdn.skypack.dev(\/\_)?\/[^\/\"\']*?\@[^\'\"]*/;
}

export class EsmShScope implements RegistryUrl {
  url: string;

  parts(): PackageInfo {
    return defaultInfo(this);
  }

  constructor(url: string) {
    this.url = url;
  }

  async all(): Promise<string[]> {
    const { scope, packageName } = this.parts();
    return await unpkgVersions(`${scope}/${packageName}`);
  }

  at(version: string): RegistryUrl {
    const url = defaultScopeAt(this, version);
    return new EsmShScope(url);
  }

  version(): string {
    return this.parts().version;
  }

  regexp = /https?:\/\/esm\.sh\/@[^\/\"\']*?\/[^\/\"\']*?\@[^\'\"]*/;
}

export class EsmSh implements RegistryUrl {
  url: string;

  name(): string {
    return defaultName(this);
  }

  constructor(url: string) {
    this.url = url;
  }

  async all(): Promise<string[]> {
    return await unpkgVersions(this.name());
  }

  at(version: string): RegistryUrl {
    const url = defaultAt(this, version);
    return new EsmSh(url);
  }

  version(): string {
    return defaultVersion(this);
  }

  regexp = /https?:\/\/esm.sh\/[^\/\"\']*?\@[^\'\"]*/;
}

export class GithubRaw implements RegistryUrl {
  url: string;

  constructor(url: string) {
    this.url = url;
  }

  all(): Promise<string[]> {
    const [, , , user, repo] = this.url.split("/");
    return githubReleases(user, repo);
  }

  at(version: string): RegistryUrl {
    const parts = this.url.split("/");
    parts[5] = version;
    return new GithubRaw(parts.join("/"));
  }

  version(): string {
    const v = this.url.split("/")[5];
    if (v === undefined) {
      throw Error(`Unable to find version in ${this.url}`);
    }
    return v;
  }

  regexp =
    /https?:\/\/raw\.githubusercontent\.com\/[^\/\"\']+\/[^\/\"\']+\/(?!master)[^\/\"\']+\/[^\'\"]*/;
}

export class JsDelivr implements RegistryUrl {
  url: string;

  constructor(url: string) {
    this.url = url;
  }

  parts(): { parts: string[]; repo: string; user: string; version: string } {
    const parts = this.url.split("/");
    const [repo, version] = parts[5].split("@");
    return {
      user: parts[4],
      repo,
      version,
      parts,
    };
  }

  all(): Promise<string[]> {
    const { user, repo } = this.parts();
    return githubReleases(user, repo);
  }

  at(version: string): RegistryUrl {
    const { parts, repo } = this.parts();
    parts[5] = `${repo}@${version}`;
    return new GithubRaw(parts.join("/"));
  }

  version(): string {
    const { version } = this.parts();
    if (version === undefined) {
      throw Error(`Unable to find version in ${this.url}`);
    }
    return version;
  }

  regexp =
    /https?:\/\/cdn\.jsdelivr\.net\/gh\/[^\/\"\']+\/[^\/\"\']+@(?!master)[^\/\"\']+\/[^\'\"]*/;
}

async function gitlabDownloadReleases(
  owner: string,
  repo: string,
  page: number,
): Promise<string[]> {
  const url =
    `https://gitlab.com/${owner}/${repo}/-/tags?format=atom&page=${page}`;

  const text = await (await fetch(url)).text();
  return [
    ...text.matchAll(
      /\<id\>https\:\/\/gitlab.com.+\/-\/tags\/(.+?)\<\/id\>/g,
    ),
  ].map((x) => x[1]);
}

// export for testing purposes
// FIXME this should really be lazy, we shouldn't always iterate everything...
export const GL_CACHE: Map<string, string[]> = new Map<string, string[]>();
async function gitlabReleases(
  owner: string,
  repo: string,
  cache: Map<string, string[]> = GL_CACHE,
): Promise<string[]> {
  const cacheKey = `${owner}/${repo}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)!;
  }
  // to roughly match GitHub above (5 pages, 10 releases each), we'll
  // limit to 3 pages, 20 releases each
  let i = 1;
  const versions = await gitlabDownloadReleases(owner, repo, i);
  if (versions.length === 20) {
    let lastVersion: string | undefined = undefined;
    while (lastVersion !== versions[versions.length - 1] && i <= 3) {
      i++;
      lastVersion = versions[versions.length - 1];
      versions.push(...await gitlabDownloadReleases(owner, repo, i));
    }
  }
  cache.set(cacheKey, versions);
  return versions;
}

export class GitlabRaw implements RegistryUrl {
  url: string;

  constructor(url: string) {
    this.url = url;
  }

  all(): Promise<string[]> {
    const [, , , user, repo] = this.url.split("/");
    return gitlabReleases(user, repo);
  }

  at(version: string): RegistryUrl {
    const parts = this.url.split("/");
    parts[7] = version;
    return new GithubRaw(parts.join("/"));
  }

  version(): string {
    const v = this.url.split("/")[7];
    if (v === undefined) {
      throw Error(`Unable to find version in ${this.url}`);
    }
    return v;
  }

  regexp =
    /https?:\/\/gitlab\.com\/[^\/\"\']+\/[^\/\"\']+\/-\/raw\/(?!master)[^\/\"\']+\/[^\'\"]*/;
}

interface NestLandResponse {
  // a list of names of the form "<repo>@<version>"
  packageUploadNames?: string[];
}

const NL_CACHE: Map<string, string[]> = new Map<string, string[]>();
async function nestlandReleases(
  repo: string,
  cache: Map<string, string[]> = NL_CACHE,
): Promise<string[]> {
  if (cache.has(repo)) {
    return cache.get(repo)!;
  }

  const url = `https://x.nest.land/api/package/${repo}`;
  const { packageUploadNames }: NestLandResponse = await (await fetch(url))
    .json();

  if (!packageUploadNames) {
    return [];
  }

  // reverse so newest versions are first
  return packageUploadNames.map((name) => name.split("@")[1]).reverse();
}

export class NestLand implements RegistryUrl {
  url: string;

  constructor(url: string) {
    this.url = url;
  }

  all(): Promise<string[]> {
    const parts = this.url.split("/");
    return nestlandReleases(parts[3].split("@")[0]);
  }

  at(version: string): RegistryUrl {
    const url = defaultAt(this, version);
    return new NestLand(url);
  }

  version(): string {
    return defaultVersion(this);
  }

  regexp =
    /https?:\/\/x\.nest\.land\/[^\/\"\']+@(?!master)[^\/\"\']+\/[^\'\"]*/;
}

export const REGISTRIES = [
  Jsr,
  DenoLand,
  UnpkgScope,
  Unpkg,
  Denopkg,
  PaxDenoDev,
  Jspm,
  PikaScope,
  Pika,
  SkypackScope,
  Skypack,
  EsmShScope,
  EsmSh,
  GithubRaw,
  GitlabRaw,
  JsDelivr,
  NestLand,
  Npm,
];
