import { useEffect } from "preact/hooks";
import { AuthChangeEvent } from "supabase";
import { Handler } from "$fresh/server.ts";
import { getCookies } from "std/http/mod.ts";
import { createServerTiming } from "./utils/serverTimings.ts";
import getSupabaseClient from "./supabase.ts";

export const useAuthStateChange = (
  callback: (event: AuthChangeEvent, res?: Response) => void,
) =>
  useEffect(() => {
    const client = getSupabaseClient();
    const { data: authListener } = client.auth.onAuthStateChange(
      (event, session) => {
        fetch("/live/api/credentials", {
          method: "POST",
          headers: new Headers({ "Content-Type": "application/json" }),
          credentials: "same-origin",
          body: JSON.stringify({ event, session }),
        }).then((res) => callback(event, res));
      },
    );

    return () => {
      authListener?.unsubscribe();
    };
  }, []);

export function getUser(req: Request) {
  const cookies = getCookies(req.headers);
  const jwt = cookies["live-access-token"];
  return getSupabaseClient().auth.api.getUser(jwt);
}

export function createPrivateHandler<T>(handler: Handler<T>): Handler<T> {
  return async (req, ctx) => {
    let res: Response;
    const url = new URL(req.url);
    const pathname = url.pathname;
    const { start, end, printTimings } = createServerTiming();
    start("auth");
    const user = await getUser(req);
    end("auth");
    if (!user || user.error) {
      res = new Response(
        user.error ? user.error.message : "Redirect to login",
        {
          status: 302,
          headers: { location: `/login${pathname}` },
        },
      );
    } else {
      ctx.state.user = user;
      res = await handler(req, ctx);
    }
    const timings = res.headers.get("Server-Timing")?.split(", ");
    const timingsHeader = timings
      ? timings.concat(printTimings()).join(", ")
      : printTimings();
    res.headers.set("Server-Timing", timingsHeader);
    return res;
  };
}
