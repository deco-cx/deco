/**
 * Allow one concurrent cb to be running.
 *
 * If cb is called again while it is running, it will be queued and run after the current cb is done.
 * If there are already any cb queued, these queued cb will be ignored and only the last cb will be run.
 */
export const throttle = (cb: () => Promise<void>) => {
  let queue = Promise.resolve();
  let head = 0;

  return () => {
    const myself = ++head;

    queue = queue.catch(() => undefined).then(() =>
      head === myself ? cb() : undefined
    );

    return queue;
  };
};

/** Delay for ms */
export const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));
