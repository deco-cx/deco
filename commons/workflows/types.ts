import type {
  Metadata,
  Workflow,
  WorkflowExecution as DurableExecution,
} from "../../deps.ts";
import type { Resolvable } from "../../engine/core/resolver.ts";
export type Arg = readonly unknown[];

// deno-lint-ignore no-explicit-any
export interface WorkflowMetadata<TProps = any> extends Metadata {
  workflow: {
    __resolveType: string;
  } & TProps;
  __resolveType: "resolvable";
}
export interface WorkflowExecution<
  TArgs extends Arg = Arg,
  TResult = unknown,
  TProps = unknown,
> {
  completedAt?: Date;
  id: string;
  status: DurableExecution<TArgs, TResult>["status"];
  workflow: string;
  input?: DurableExecution<TArgs, TResult>["input"];
  output?: TResult;
  props?: TProps;
}

const WORKFLOW_QS = "workflow";
export const WorkflowQS = {
  buildFromProps: (workflow: unknown): string => {
    return `${WORKFLOW_QS}=${
      encodeURIComponent(btoa(JSON.stringify(workflow)))
    }`;
  },
  extractFromUrl: (
    urlString: string,
  ): Resolvable<Workflow> | undefined => {
    const url = new URL(urlString);
    const qs = url.searchParams.get(WORKFLOW_QS);
    if (!qs) {
      return undefined;
    }
    return JSON.parse(atob(decodeURIComponent(qs)));
  },
};

const withoutResolveType = <T extends { __resolveType: string }>(
  { __resolveType, ...rest }: T,
): Omit<T, "__resolveType"> => {
  return rest;
};
export const toExecution = <
  TArgs extends Arg = Arg,
  TResult = unknown,
  TProps = unknown,
>(
  { id, status, input, output, metadata, completedAt }: DurableExecution<
    TArgs,
    TResult,
    WorkflowMetadata<TProps>
  >,
): WorkflowExecution<TArgs, TResult, TProps> => {
  return {
    id,
    status,
    input,
    output,
    completedAt,
    workflow: metadata!.workflow.__resolveType,
    props: withoutResolveType(metadata!.workflow) as WorkflowExecution<
      TArgs,
      TResult,
      TProps
    >["props"],
  };
};
