import { Jsr } from "../../scripts/registry.ts";

export interface PackageMeta {
  exports: Record<string, string>;
}
const cachedJsrMeta = new Map<string, Promise<PackageMeta>>();
const fetchMetaExports = (
  packg: string,
  version: string,
): Promise<PackageMeta> => {
  const key = `${packg}/${version}`;
  if (cachedJsrMeta.has(key)) {
    return cachedJsrMeta.get(key)!;
  }
  const packageMetaPromise = fetch(
    `https://jsr.io/${packg}/${version}_meta.json`,
  ).then(
    (meta) => meta.json() as Promise<PackageMeta>,
    // there are other fields that dosn't need to be cached as they are very large.
  ).then(({ exports }) => {
    return { exports };
  });
  cachedJsrMeta.set(key, packageMetaPromise);
  packageMetaPromise.catch((_err) => {
    cachedJsrMeta.delete(key);
  });
  return packageMetaPromise;
};
export const resolveJsrSpecifier = async (specifier: string) => {
  if (!specifier.startsWith("jsr:")) {
    return specifier;
  }
  const jsr = new Jsr(specifier);

  const [
    name,
    version,
    files,
  ] = [jsr.name(), jsr.version(), jsr.files()];
  const { exports } = await fetchMetaExports(name, version);
  return `https://jsr.io/${name}/${version}${exports[files]?.slice(1) ?? ""}`;
};
