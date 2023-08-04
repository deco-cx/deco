import { format } from "$live/dev.ts";
import { InitContext } from "$live/scripts/apps/init.ts";

export default async function DenoJson(_ctx: InitContext) {
  return await format(`
    {
        "lock": false,
        "tasks": {
          "check": "deno fmt && deno lint",
          "release": "deno eval 'import \"$live/scripts/release.ts\"'",
          "start": "deno eval 'import \"$live/scripts/apps/bundle.ts\"'",
          "link": "deno eval 'import \"$live/scripts/apps/link.ts\"'",
          "unlink": "deno eval 'import \"$live/scripts/apps/unlink.ts\"'"
        },
        "githooks": {
          "pre-commit": "check"
        },
        "exclude": ["static", "README.md"],
        "importMap": "./import_map.json",
        "compilerOptions": {
          "jsx": "react-jsx",
          "jsxImportSource": "preact"
        }
      }
    `);
}
