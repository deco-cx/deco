export const getReleaseJSONFromRelease = (
  releaseJson: Record<string, unknown>,
  appName?: string,
) => ({
  "decohub": {
    __resolveType: appName ? `${appName}/apps/decohub.ts` : undefined,
  },
  "admin-app": {
    resolvables: {
      __resolveType: "deco-sites/admin/loaders/state.ts",
    },
    __resolveType: "decohub/apps/admin.ts",
  },
  ...releaseJson,
});
