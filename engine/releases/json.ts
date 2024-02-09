export const getReleaseJSONFromRelease = (
  releaseJson: Record<string, unknown>,
  appName?: string,
) => ({
  decohub: {
    apps: [
      {
        name: appName,
        __resolveType: "files/loaders/app.ts",
      },
    ],
    __resolveType: appName ? `${appName}/apps/decohub.ts` : undefined,
  },
  files: {
    root: {
      name: "",
      nodes: [{
        name: appName,
        nodes: [],
      }],
    },
    __resolveType: "decohub/apps/files.ts",
  },
  "admin-app": {
    resolvables: {
      __resolveType: "deco-sites/admin/loaders/state.ts",
    },
    __resolveType: "decohub/apps/admin.ts",
  },
  ...appName
    ? {
      [appName]: {
        routes: [
          {
            __resolveType: "website/loaders/pages.ts",
          },
        ],
        __resolveType: `decohub/apps/${appName}.ts`,
      },
    }
    : {},
  ...releaseJson,
});
