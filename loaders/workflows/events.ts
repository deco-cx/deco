import { history } from "$live/commons/workflows/initialize.ts"; // side-effect initialize
import type { HistoryEvent, Pagination } from "$live/deps.ts";
import { StreamProps } from "$live/utils/invoke.ts";

export interface Props extends StreamProps {
  id: string;
  page?: number;
  pageSize?: number;
}

export type Events =
  | Pagination<HistoryEvent>
  | AsyncIterableIterator<HistoryEvent>;

/**
 * @description Get the workflow execution events.
 */
export default function getExecutionEvents(
  { id, ...rest }: Props,
): Promise<Events> {
  return history(id, rest);
}
