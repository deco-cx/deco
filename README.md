# deco-fresh

deco-fresh builds on top of deno, fresh, deconfig and supabase to provide a simple way to manage your digital experience on the edge.

## Concepts

The core `deconfig` schema is:

```typescript
export type ConfigKey = string;

export interface Config<T> {
  id: string;
  key: ConfigKey;
  description?: string;
  value?: T;
  priority: number;
}
```

We extend that with new functionality:

```typescript
// FnProps are generic functions defined in your deno source code which accept props and return data
export type FnProps<Props, Result> = {
  fn: (...: Props) => Promise<Result> | Result;
  props: Props;
};

// Sections are FnProps configs which return JSX
export type Section<Props> = Config<{
  section: FnProps<Props, JSX>;
}>

// Loaders are FnProps configs which return fetched data
export type Loader<Props, Result> = Config<{
  loader: FnProps<Props, Result>;
}>

// Audiences are FnProps configs which return a boolean if the current request matches the audience
export type Audience<Props> = Config<{
  loader: FnProps<Props, boolean>;
}>

export type AudienceOperator = "and" | "or";

// Flags are compositions of audiences which are used to prioritize other configs
export type Flag = Config<{
  audiences: Array<AudienceOperator | Audience>;
  prioritize: ConfigKey[];
}>

// Pages are compositions of loaders and sections which are rendered to HTML + JS + CSS
export type Page = Config<{
  loaders: Array<Loader>;
  sections: Array<Section>;
}>

// Workflows are FnProps configs which return a workflow execution
export type Workflow<Props> = Config<{
  workflow: FnProps<Props, WorkflowExecution>;
}>
```
