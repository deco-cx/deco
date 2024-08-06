import { createHandler } from "../middleware.ts";

export const handler = createHandler(async (
  { var: state },
) => {
  return new Response(
    JSON.stringify(await state.release.state()),
    {
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
});
