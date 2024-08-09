import type { InitContext } from "../context.ts";

export default function DenoJson({ decoVersion }: InitContext) {
    return (
        JSON.stringify(
            {
                "lock": false,
                "imports": {
                    "$live/":
                        `https://denopkg.com/deco-cx/deco@${decoVersion}/`,
                    "deco/": `https://denopkg.com/deco-cx/deco@${decoVersion}/`,
                    "$fresh/": "https://denopkg.com/denoland/fresh@1.5.2/",
                    "preact": "https://esm.sh/preact@10.15.1",
                    "preact/": "https://esm.sh/preact@10.15.1/",
                    "preact-render-to-string":
                        "https://esm.sh/*preact-render-to-string@6.2.0",
                    "@preact/signals": "https://esm.sh/*@preact/signals@1.1.3",
                    "@preact/signals-core":
                        "https://esm.sh/@preact/signals-core@1.3.0",
                    "std/": "https://deno.land/std@0.190.0/",
                    "partytown/": "https://deno.land/x/partytown@0.3.0/",
                },
                "tasks": {
                    "check": "deno fmt && deno lint",
                    "release": "deno eval 'import \"deco/scripts/release.ts\"'",
                    "start":
                        "deno eval 'import \"deco/scripts/apps/bundle.ts\"'",
                    "link": "deno eval 'import \"deco/scripts/apps/link.ts\"'",
                    "unlink":
                        "deno eval 'import \"deco/scripts/apps/unlink.ts\"'",
                    "serve":
                        "deno eval 'import \"deco/scripts/apps/serve.ts\"'",
                    "watcher":
                        "deno eval 'import \"deco/scripts/apps/watcher.ts\"'",
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
