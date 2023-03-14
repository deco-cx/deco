## Detailed implementation

The config resolution algorithm is based on two basic building blocks: **Resolvers** and **Resolvables**, when put together they form the **Configuration State**.

### Resolvers

Resolvers are functions that has an arbitrary name, receives a context and an input, and produces an output, resolvers can be either sync or async and can also optionally returns a resolvable. The default resolver receives an input and produces the same input as received.

```ts
export type AsyncResolver<
  T = any,
  TParent = any,
  TContext extends BaseContext = BaseContext
> = (parent: TParent, context: TContext) => Promise<Resolvable<T> | T>;

export type SyncResolver<
  T = any,
  TParent = any,
  TContext extends BaseContext = BaseContext
> = (parent: TParent, context: TContext) => Resolvable<T> | T;

export type Resolver<
  T = any,
  TParent = any,
  TContext extends BaseContext = BaseContext
> = AsyncResolver<T, TParent, TContext> | SyncResolver<T, TParent, TContext>;
```

Meaning that a `Resolver<T, TInput>` is whatever function that takes TInput as a parameter and returns T or Resolvable<T> as an output.

### Resolvable

**Resolvables** are arbitrary json that contains a property named `__resolveType` which points to either: A resolver or a resolvable. When pointing to a **Resolver** the data is passed as a input to such resolver and when pointing to a **Resolvable** the algorithm starts again taking the target resolvable as input for the `__resolveType` property.

When the reference for `__resolveType` is missing, a `Dangling reference` error is thrown to sinalize that the configuration state is invalid and must be fixed.

See an example below

```json
{
  "loader-category-homens": {
    "category": "Homens",
    "__resolveType": "./loaders/VTEXProductList.ts"
  },
  "page-homens": {
    "sections": [
      {
        "products": {
          "__resolveType": "loader-category-homens"
        },
        "__resolveType": "./sections/ProductShelf.tsx"
      }
    ],
    "__resolveType": "$live/pages/LivePage.tsx"
  }
}
```

Notice that the `loader-category-homens` is referenced by the `page-homens` Resolvable.

Below you can see an example of a `dangling reference`.

```json
{
  "page-homens": {
    "sections": [
      {
        "products": {
          "__resolveType": "loader-category-homens"
        },
        "__resolveType": "./sections/ProductShelf.tsx"
      }
    ],
    "__resolveType": "$live/pages/LivePage.tsx"
  }
}
```

Notice that the `loader-category-homens` was removed.

## Resolution Algorithm

The resolution algorithm takes either a Resolvable<T> or the ResolvableId as a parameter (e.g `page-homens`) and the configuration state and returns the T value to the caller, following the steps below:

1. If it is a ResolvableId, get the Resolvable from the config state, otherwise use the provided Resolvable.
2. Check if the Resolvable has a valid \_\_resolveType reference or it is a primitive type
3. If primitive (boolean, number, function, string), so return straight itself as a result
4. if it is a object, then for each key of the object call the resolution function recursively
5. if it is an array, then for each index call the resolution function recursively
6. when the resolver result is calculated so the resolution algorithm takes the function referenced to the \_\_resolveType and use the resolved value as an input providing the output for the outer caller.
7. If the result of the Resolver is a Resolvable so the algorithm will be repeated until all inner objects are resolved

> In case of name clash (Resolver and Resolvable with the same name) a Resolver function takes precedence.

Important:
If the target object that needs to be resolved does not contains the `__resolveType` property so the resolver algorithm consider as a resolved object. Which means that if you have inner objects that needs to be resolved in the same resolution cycle, so you need to manually reference the `resolve` function which is the default resolver. We chose to do that to avoid unnecessary computation (going too far when there's nothing to resolve) when possible (and there's a ambiguity between resolved objects and resolvable-eligible objects).

The following object does not resolve the inner `sections` array

```json
{
  "name": "my-config-name",
  "sections": [{ "__resolveType": "section#123" }]
}
```

To fix that use the `resolve` func.

```json
{
  "name": "my-config-name",
  "sections": [{ "__resolveType": "section#123" }],
  "__resolveType": "resolve"
}
```
