import { HandlerContext } from "$fresh/server.ts";
import { join } from "std/path/mod.ts";

export const handler = async (req: Request, __: HandlerContext) => {
  return new Response(
    await Deno.readTextFile(join(Deno.cwd(), "schemas.gen.json")),
    {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": req.headers.get("origin") || "*",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, *",
      },
    },
  );
};
