import { createHandler } from "../middleware.ts";

export const styles = createHandler(async (ctx) => {
  try {
    return new Response(await ctx.var.deco.styles(), {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": "text/css; charset=utf-8",
      },
    });
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return new Response(null, { status: 404 });
    }

    const errStack = Deno.inspect(error, {
      colors: false,
      depth: 100,
    });
    console.error(`error generating styles`, errStack);
    return new Response(errStack, {
      status: 500,
    });
  }
});
