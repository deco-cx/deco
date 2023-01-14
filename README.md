# deco-runtime

deco-fresh builds on top of deno, fresh, deconfig and supabase to provide a simple way to manage your digital experience on the edge.

## Concepts

The core `deconfig` schema is:

```typescript
export type ConfigKey = string;

export interface Config<T> {
  id: string;
  key: ConfigKey;
  active: boolean;
  description?: string;
  value?: T;
}
```

We extend that with new types of configuration:

```typescript
// FnProps are generic functions defined in your deno source code which accept props, req? and return data
export type FnProps<Props, Result> = {
  fn: (props: Props, req?: Request) => Promise<Result> | Result;
  props: Props;
};

// Accounts are FnProps configs which store account credentials
export type Account<Props> = Config<{
  account: FnProps<Props, boolean>;
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

// Flags are compositions of audiences which are used to prioritize specific configs
export type Flag = Config<{
  audiences: Array<AudienceOperator | Audience>;
  prioritize: ConfigKey[];
}>

// Pages are compositions of loaders and sections which are rendered to HTML + JS + CSS
export type Page = Config<{
  loaders: Array<Loader>;
  sections: Array<Section>;
}>
```
