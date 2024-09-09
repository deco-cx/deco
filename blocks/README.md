# Blocks Overview

Imagine being able to serialize a function and save it in a database. What if
this function could be composed together with multiple options? How would that
change the way you develop web applications?

In `deco`, the world revolves around **Blocks**. These Blocks are serialized
functions that can be seamlessly composed together, allowing for limitless
possibilities and customization.

## What is a Block?

A Block in `deco` is similar to what a class is in object-oriented programming
languages like Java. Blocks represent specialized resolvers—functions that the
deco engine can handle with additional capabilities. They are strongly-typed,
meaning their inputs and outputs are explicitly defined. This enables `deco`'s
schema engine to generate the appropriate JSON schema forms for the Blocks,
ensuring they integrate seamlessly with other components in your application.

### Key Features of Blocks

- **Strong Typing**: Blocks are strongly-typed, with well-defined input and
  output schemas. This allows for better type safety and integration within the
  `deco` ecosystem.
- **Composable**: Blocks can be combined with other Blocks to create complex,
  customized functionality.
- **Reusable**: Once created, Blocks can be saved and reused across different
  parts of your application, promoting modularity.
- **Organized Structure** : Blocks live in a specified folder within your
  project, typically with the same type of the block (e.g. "loaders").
-

### Block Structure

Here is an example of how a Block is defined in TypeScript:

```typescript
// deno-lint-ignore-file no-explicit-any
import type { FunctionComponent } from "preact";
import type { JSONSchema7, Program, TsType } from "../deps.ts";
import type { HintNode } from "../engine/core/hints.ts";
import type { FieldResolver, Resolver } from "../engine/core/resolver.ts";
import type { PromiseOrValue } from "../engine/core/utils.ts";
import type { ResolverMiddleware } from "../engine/middleware.ts";
import type { Schemeable } from "../engine/schema/transform.ts";
import type { AppManifest } from "../types.ts";
import type { BlockInvocation } from "./manifest/defaults.ts";

export interface BlockModuleRef {
  inputSchema?: Schemeable;
  outputSchema?: Schemeable;
  functionRef: ImportString;
  functionJSDoc?: JSONSchema7;
}

export type ResolverLike<T = any> = (...args: any[]) => PromiseOrValue<T>;
export type BlockModule<
  TDefaultExportFunc extends ResolverLike<T> = ResolverLike,
  T = TDefaultExportFunc extends ResolverLike<infer TValue> ? TValue : any,
  TSerializable = T,
> = {
  default: TDefaultExportFunc;
  invoke?: Resolver<TSerializable, BlockInvocation, any>;
  preview?: Resolver<PreactComponent, TSerializable, any>;
  Preview?: ComponentFunc;
  onBeforeResolveProps?: (props: any, hints: HintNode<any>) => any;
};
```

### Specialized Blocks

Blocks are specialized for different purposes. For example, a **Loader Block**
might have additional methods for handling caching:

```typescript
export interface LoaderModule<TProps = any, TState = any>
  extends BlockModule<FnProps<TProps>> {
  cache?: "no-store" | "stale-while-revalidate" | "no-cache";
  cacheKey?: (
    props: TProps,
    req: Request,
    ctx: FnContext<TState>,
  ) => string | null;
}
```

This allows the Block to manage how data is cached and retrieved, adding a layer
of functionality specific to loading operations.

### Example: Loader Block

A **Loader Block** is a special type of Block designed to fetch data, often from
an external source. Here's an example of a Loader Block implementation:

```typescript
const loaderBlock: Block<LoaderModule> = {
  type: "loaders",
  introspect: { includeReturn: true },
  adapt: <TProps = any>(mod: LoaderModule<TProps>) => [
    wrapCaughtErrors,
    (props: TProps, ctx: HttpContext<{ global: any } & RequestState>) =>
      applyProps(wrapLoader(mod, ctx.resolveChain, ctx.context.state.release))(
        props,
        ctx,
      ),
  ],
  defaultPreview: (result) => {
    return {
      Component: JsonViewer,
      props: { body: JSON.stringify(result, null, 2) },
    };
  },
};

/**
 * <TResponse>(req: Request, ctx: HandlerContext<any, LiveConfig<TConfig>>) => Promise<TResponse> | TResponse
 * Loaders are arbitrary functions that always run in a request context, returning a response based on the config parameters and the request.
 */
export default loaderBlock;
```

In this example, the Loader Block includes:

- **Caching**: The `cache` option defines how the Loader handles caching.
- **Single Flight**: Ensures that only one instance of a Loader runs at a time
  for the same request, preventing duplicate fetches.
- **Error Handling**: Errors are managed and wrapped to prevent crashes during
  resolution.

### Summary

Blocks in `deco` are the building blocks of your web applications. They
encapsulate functionality in a reusable, strongly-typed, and composable way.
Whether you're creating an Inline Block for immediate use or saving a Block for
future reuse, the flexibility and power of Blocks make `deco` a powerful tool
for developing complex, customized web applications quickly and efficiently.

### Manifest File

All Blocks within an application are grouped together in a file called
manifest.gen.ts. This file is auto-generated and contains references to every
Block in the app. The manifest is crucial because it acts as a registry for all
available Blocks, making them easy to discover and use within your project.

- **Auto-Generated**: The manifest is generated automatically by running the
  deno task bundle command. You should not edit this file manually.
- **Centralized Registry**: This file serves as a centralized registry for all
  the Blocks in your application. When an app is installed, all Blocks specified
  in its manifest become available for use.
