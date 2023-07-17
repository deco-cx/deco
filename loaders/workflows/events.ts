import {
  signedFetch,
  workflowServiceInfo,
} from "$live/commons/workflows/serviceInfo.ts";
import type { HistoryEvent, Pagination } from "$live/deps.ts";
import { readFromStream } from "$live/utils/http.ts";
import { isStreamProps, StreamProps } from "$live/utils/invoke.ts";

export interface Props extends StreamProps {
  id: string;
  page?: number;
  pageSize?: number;
}

const DEFAULT_PAGE_SIZE = 10;

export type Events =
  | Pagination<HistoryEvent>
  | AsyncIterableIterator<HistoryEvent>;

/**
 * @description Get the workflow execution events.
 */
export default async function getExecutionEvents(
  props: Props,
): Promise<Events> {
  const [_, svcUrl] = workflowServiceInfo();
  const base = `${svcUrl}/executions/${props.id}/history`;
  if (isStreamProps(props)) {
    const resp = await signedFetch(`${base}?stream=true`);
    return readFromStream<HistoryEvent>(resp);
  }

  const { page, pageSize } = props;

  const resp = await signedFetch(
    `${base}?page=${page ?? 0}&pageSize=${pageSize ?? DEFAULT_PAGE_SIZE}`,
  );
  if (resp.ok) {
    return resp.json();
  }
  throw new Error(`${resp.status}`);
}
