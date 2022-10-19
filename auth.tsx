import { useEffect } from "preact/hooks";
import { AuthChangeEvent } from "supabase";
import { Handler, Handlers } from "$fresh/server.ts";
import { getCookies, setCookie } from "std/http/mod.ts";
import { createServerTiming } from "./utils/serverTimings.ts";
import getSupabaseClient from "./supabase.ts";
import LiveContext from "./context.ts";

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
    const { start, end, printTimings } = createServerTiming();
    start("auth");
    const user = await getUser(req);
    end("auth");
    if (!user || user.error) {
      res = new Response(user.error ? user.error.message : "Redirect", {
        status: 302,
        headers: { location: LiveContext.getLoginUrl() },
      });
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

export const authHandler: Handlers = {
  async POST(req, ctx) {
    const headers = new Headers();
    const { event, session } = await req.json();
    console.log({ event, session });
    if (!event) throw new Error("Auth event missing!");
    if (event === "SIGNED_IN") {
      if (!session) throw new Error("Auth session missing!");

      [
        { key: "access-token", value: session.access_token },
        { key: "refresh-token", value: session.refresh_token },
      ]
        .map((token) => ({
          name: `live-${token.key}`,
          value: token.value,
          path: "/",
          // domain: this.cookieOptions.domain,
          // maxAge: this.cookieOptions.lifetime ?? 0,
          // sameSite: this.cookieOptions.sameSite,
        }))
        .forEach((cookie) => setCookie(headers, cookie));
    }
    if (event === "SIGNED_OUT") {
      ["access-token", "refresh-token"]
        .map((key) => ({
          name: `live-${key}`,
          value: "",
          maxAge: -1,
        }))
        .forEach((cookie) => setCookie(headers, cookie));
    }

    return new Response(null, { status: 200, headers });
  },
};
