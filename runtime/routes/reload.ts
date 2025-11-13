import { createHandler } from "../middleware.ts";

export const handler = createHandler((
  { var: state, req },
) => {
  const delay = req.query("delay");
  const delayMs = delay ? parseInt(delay) : 1000;
  const interval = Math.min(delayMs, 1000); // Use 1s, or delay if less than 1s

  const intervalId = setInterval(async () => {
    await state.release.notify?.();
  }, interval);

  // Clear the interval after the delay duration has passed
  setTimeout(() => {
    clearInterval(intervalId);
  }, delayMs);

  return new Response(
    JSON.stringify({ scheduled: true }),
    {
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
});
