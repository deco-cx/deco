# `deno_doc`

This repository includes a compiled version of the Rust crate as Web Assembly
and exposes an interface which is available via the `mod.ts` and can be imported
like this:

```ts
import { doc } from "https://deno.land/x/deno_doc@{VERSION}/mod.ts";
```

Where `{VERSION}` should be substituted with the specific version you want to
use.

## `doc()`

The `doc()` function takes a string URL module specifier and potentially some
options, and asynchronously resolves with an array of documentation nodes, which
represent the surface API of the module.

A minimal example of using `doc()` and printing out some information about a
function:

```ts
import { doc } from "https://deno.land/x/deno_doc@{VERSION}/mod.ts";

const colorsDoc = await doc("https://deno.land/std/fmt/colors.ts");

for (const node of colorsDoc) {
  console.log(`name: ${node.name} kind: ${node.kind}`);
}
```

The `doc()` function needs a way to retrieve modules, and by default uses a
`load()` function provided by `deno_graph` which uses `fetch()` for remote
modules and `Deno.readFile()` for local modules. This means that `doc()` will
require that appropriate read/net permissions to function properly. It will
prompt for them if not provided at startup.

## DocNode

The foundational type for the documentation is the `DocNode` and is exported
from the `mod.ts`.
