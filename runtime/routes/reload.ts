import { createHandler } from "../middleware.ts";

export const handler = createHandler(async (
  { var: state, req },
) => {
  const isUpToDate = Promise.withResolvers<void>();
  const delay = req.query("delay");
  const delayMs = delay ? parseInt(delay) : 5000;

  let currentInterval = 1000; // Start with 1 second
  const maxInterval = 10000; // Cap at 10 seconds to avoid huge gaps
  let elapsed = 0;
  let resolved = false;
  using _ = state.release.onChange(() => {
    isUpToDate.resolve(); // force resolve
    resolved = true;
  });

  const scheduleNext = () => {
    if (elapsed >= delayMs || resolved) {
      isUpToDate.resolve(); // force resolve
      state.release.notify?.();
      return; // Stop when we've reached the delay
    }

    setTimeout(async () => {
      await state.release.notify?.();

      elapsed += currentInterval;
      currentInterval = Math.min(currentInterval * 2, maxInterval); // Double but cap at maxInterval
      scheduleNext(); // Schedule the next notification
    }, currentInterval);
  };

  scheduleNext(); // Start the exponential retry process

  await isUpToDate.promise;
  return new Response(
    JSON.stringify({ elapsed }),
    {
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
});
