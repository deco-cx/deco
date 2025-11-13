import { createHandler } from "../middleware.ts";

export const handler = createHandler((
  { var: state, req },
) => {
  const delay = req.query("delay");
  setTimeout(async () => {
    await state.release.notify?.();
  }, delay ? parseInt(delay) : 0);
  return new Response(
    JSON.stringify({ scheduled: true }),
    {
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
});
