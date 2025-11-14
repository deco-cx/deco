import { createHandler } from "../middleware.ts";

export const handler = createHandler((
  { var: state, req },
) => {
  const delay = req.query("delay");
  const delayMs = delay ? parseInt(delay) : 5000;

  let currentInterval = 1000; // Start with 1 second
  let elapsed = 0;

  const scheduleNext = () => {
    if (elapsed >= delayMs) {
      return; // Stop when we've reached the delay
    }

    setTimeout(async () => {
      await state.release.notify?.();

      elapsed += currentInterval;
      currentInterval *= 2; // Double for next time (exponential backoff)
      scheduleNext(); // Schedule the next notification
    }, currentInterval);
  };

  scheduleNext(); // Start the exponential retry process

  return new Response(
    JSON.stringify({ scheduled: true }),
    {
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
});
