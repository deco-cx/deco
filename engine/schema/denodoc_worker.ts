// The message handler is only set after that 1s delay, so some of the messages
// that reached the worker during that second might have been fired when no

import { docAsLib } from "$live/engine/schema/denodoc_wasm.ts";

// handler was registered.
self.onmessage = async (evt: MessageEvent<string>) => {
  try {
    console.log("received", evt.data);
    const resp = await docAsLib(evt.data).catch((err) => {
      console.log("ignoring", err);
      return [];
    });
    self.postMessage(resp);
  } catch (err) {
    console.log("ignoring", err);
  }
};
