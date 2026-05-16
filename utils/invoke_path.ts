export interface ResolvedInvokePath {
  key: string;
  dynamicSegments: string[];
}

export interface DynamicParamsBlock {
  dynamicParams?: readonly string[];
}

export interface InvokableManifest {
  loaders?: Record<string, unknown>;
  actions?: Record<string, unknown>;
  functions?: Record<string, unknown>;
}

const ENCODED_SLASH_PATTERN = /%2f/i;

const stripTerminalExtension = (key: string) => key.replace(/\.(tsx?)$/, "");

const safeDecodeURIComponent = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export function resolveInvokePath(
  rawPath: string,
  invokableKeys: Iterable<string>,
): ResolvedInvokePath | undefined {
  const path = rawPath.replace(/^\/+|\/+$/g, "");
  const matches = [...invokableKeys]
    .map((key) => ({ key, extensionlessKey: stripTerminalExtension(key) }))
    .filter(({ key, extensionlessKey }) =>
      path === key || path.startsWith(`${key}/`) ||
      path === extensionlessKey || path.startsWith(`${extensionlessKey}/`)
    )
    .sort((a, b) => b.extensionlessKey.length - a.extensionlessKey.length);

  const match = matches[0];
  if (!match) {
    return { key: path, dynamicSegments: [] };
  }

  const prefix = path === match.key || path.startsWith(`${match.key}/`)
    ? match.key
    : match.extensionlessKey;
  const suffix = path.slice(prefix.length).replace(/^\//, "");
  const encodedSegments = suffix ? suffix.split("/") : [];

  if (encodedSegments.some((segment) => ENCODED_SLASH_PATTERN.test(segment))) {
    return undefined;
  }

  return {
    key: match.key,
    dynamicSegments: encodedSegments.map(safeDecodeURIComponent),
  };
}

export function invokableKeysFromManifest(
  manifest: InvokableManifest,
): string[] {
  return [
    ...Object.keys(manifest.loaders ?? {}),
    ...Object.keys(manifest.actions ?? {}),
    ...Object.keys(manifest.functions ?? {}),
  ];
}

export function blockFromManifest(
  manifest: InvokableManifest,
  key: string,
): DynamicParamsBlock | undefined {
  return (manifest.loaders?.[key] ?? manifest.actions?.[key] ??
    manifest.functions?.[key]) as DynamicParamsBlock | undefined;
}

export function mergeDynamicProps(
  props: Record<string, unknown> | undefined,
  dynamicParamNames: readonly string[] | undefined,
  dynamicSegments: readonly string[],
): Record<string, unknown> | undefined {
  if (!dynamicParamNames?.length || !dynamicSegments.length) {
    return props;
  }

  return dynamicParamNames.reduce<Record<string, unknown>>(
    (acc, name, index) => {
      const value = dynamicSegments[index];
      if (value !== undefined) {
        acc[name] = value;
      }
      return acc;
    },
    { ...props },
  );
}

export function resolveDynamicInvokeProps(
  key: string,
  props: Record<string, unknown> | undefined,
  manifest: InvokableManifest,
): { key: string; props: Record<string, unknown> | undefined } | undefined {
  const resolved = resolveInvokePath(key, invokableKeysFromManifest(manifest));
  if (!resolved) {
    return undefined;
  }

  const block = blockFromManifest(manifest, resolved.key);
  if (
    resolved.dynamicSegments.length &&
    (!block?.dynamicParams?.length ||
      resolved.dynamicSegments.length > block.dynamicParams.length)
  ) {
    return undefined;
  }

  return {
    key: resolved.key,
    props: mergeDynamicProps(
      props,
      block?.dynamicParams,
      resolved.dynamicSegments,
    ),
  };
}
