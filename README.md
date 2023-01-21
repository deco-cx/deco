# deco-runtime

deco-runtime builds on top of deno, fresh, deconfig and supabase to provide a simple way to manage your digital experience on the edge.

## Concepts

The core `deconfig` schema is:

```typescript
export type ConfigId = number;

export interface Config<T> {
  id: ConfigId;
  created_at: Date;
  active: boolean;
  key: string;
  value?: T;
  description?: string;
}
```

We extend that with new types of configuration:

```typescript
// FnProps are generic functions defined in your deno source code which accept props, req? and return data
export type FnProps<Props, Result> = {
  fn: (props: Props, req?: Request, ctx?: any) => Promise<Result> | Result;
  props: Props;
};

// Accounts are FnProps configs which store account credentials
export type Account<Props> = Config<{
  account: FnProps<Props, any>;
}>

// Audiences are FnProps configs which return a boolean if the current request matches the audience
export type Audience<Props> = Config<{
  audience: FnProps<Props, boolean>;
}>

// Loaders are FnProps configs which return fetched data
export type Loader<Props, Result> = Config<{
  loader: FnProps<Props, Result>;
}>

// Sections are FnProps configs which return JSX
export type Section<Props> = Config<{
  section: FnProps<Props, JSX>;
}>

// Workflows are FnProps configs which return a workflow execution
export type Workflow<Props> = Config<{
  workflow: FnProps<Props, WorkflowExecution>;
}>

// All of the above are the "building blocks" for pages and flags, which are composed in the UI:
export type AudienceOperator = "and" | "or";

export type Variation<V> = Config<{
  variation: FnProps<Props, V>;
}>

// Flags are compositions of audiences which are used to prioritize specific configs
export type Flag<V> = Config<{
  traffic: number; // 0.3 = 30% of traffic
  audiences: Array<AudienceOperator | Audience>;
  variations?: string[] | number[] | boolean[] | Variation<V>;
  value: any;
}>

export type Redirect = Config<{
  redirect: string;
}>

// Pages are compositions of loaders and sections which are rendered to HTML + JS + CSS
export type Page = Config<{
  loaders: Array<Loader>;
  sections: Array<Section>;
}>
```

## Experiment and Campaign tracking

Experiments and Campaigns are types of `Flags`, which are composed of `Audiences` and `Prioritize` a list of `ConfigKey`s.

When you create pages, there may be multiple versions of the same page in a giver route, each with a different `ConfigKey` and `value` (different loaders and sections). You can use `Flags` to prioritize which version of the page is shown to a specific audience.

## Flag and page evaluation order

