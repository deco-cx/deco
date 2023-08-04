import { InitContext } from "../init.ts";

export default function DenoJson(_ctx: InitContext) {
  return (
    JSON.stringify(
      {
        "lock": false,
        "tasks": {
          "check": "deno fmt && deno lint",
          "release": "deno eval 'import \"$live/scripts/release.ts\"'",
          "start": "deno eval 'import \"$live/scripts/apps/bundle.ts\"'",
          "link": "deno eval 'import \"$live/scripts/apps/link.ts\"'",
          "unlink": "deno eval 'import \"$live/scripts/apps/unlink.ts\"'",
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
