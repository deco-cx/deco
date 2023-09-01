import type { InitContext } from "../context.ts";

export default function DenoJson(_ctx: InitContext) {
  return (
    JSON.stringify(
      {
        "lock": false,
        "tasks": {
          "check": "deno fmt && deno lint",
          "release": "deno eval 'import \"deco/scripts/release.ts\"'",
          "start": "deno eval 'import \"deco/scripts/apps/bundle.ts\"'",
          "link": "deno eval 'import \"deco/scripts/apps/link.ts\"'",
          "unlink": "deno eval 'import \"deco/scripts/apps/unlink.ts\"'",
          "serve": "deno eval 'import \"deco/scripts/apps/serve.ts\"'",
        },
        "githooks": {
          "pre-commit": "check",
        },
        "exclude": ["static", "README.md"],
        "importMap": "./import_map.json",
        "compilerOptions": {
          "jsx": "react-jsx",
          "jsxImportSource": "preact",
        },
      },
      null,
      2,
    )
  );
}
