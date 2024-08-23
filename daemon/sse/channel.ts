import type { FSEvent } from "../fs/common.ts";
import type { MetaEvent } from "../meta.ts";
import type { WorkerStatusEvent } from "../worker.ts";

export type DaemonEvent = FSEvent | MetaEvent | WorkerStatusEvent;

export const channel = new EventTarget();

export const broadcast = (msg: DaemonEvent) => {
  channel.dispatchEvent(new CustomEvent("broadcast", { detail: msg }));
};
