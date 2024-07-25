import type { DecoHandler } from "../middleware.ts";

export const handler: DecoHandler = async (
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
};
