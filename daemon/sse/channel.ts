import type { FSEvent } from "../fs/common.ts";
import type { MetaEvent } from "../meta.ts";
import type { WorkerStatusEvent } from "../worker.ts";

export type DaemonEvent = FSEvent | MetaEvent | WorkerStatusEvent;

const channel = new EventTarget();

export const broadcast = (msg: DaemonEvent) => {
  channel.dispatchEvent(new CustomEvent("broadcast", { detail: msg }));
};

export async function* listen(signal: AbortSignal) {
  while (!signal.aborted) {
    const p = Promise.withResolvers<DaemonEvent>();

    channel.addEventListener(
      "broadcast",
      (e) => p.resolve((e as CustomEvent<DaemonEvent>).detail),
      { once: true },
    );

    yield p.promise;
  }
}
