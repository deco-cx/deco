/** @jsx h */
import { h } from "preact";
import { useCallback, useEffect } from "preact/hooks";
import { Handler, Handlers } from "$fresh/server.ts";
import { getCookies, setCookie } from "std/http/mod.ts";
import { createServerTiming } from "./utils/serverTimings.ts";

import getSupabaseClient from "./supabase.ts";

export function AuthListener() {
  useEffect(() => {
    const client = getSupabaseClient();
    const { data: authListener } = client.auth.onAuthStateChange(
      (event, session) => {
        fetch("/api/credentials", {
          method: "POST",
          headers: new Headers({ "Content-Type": "application/json" }),
          credentials: "same-origin",
          body: JSON.stringify({ event, session }),
        });
      },
    );

    return () => {
      authListener?.unsubscribe();
    };
  }, []);
  return <span data-live="auth-listener"></span>;
}

export function Login() {
  const google = useCallback(() => {
    getSupabaseClient().auth.signIn({ provider: "google" }, {
      shouldCreateUser: true,
    }).then(console.log);
  }, []);
  const github = useCallback(() => {
    getSupabaseClient().auth.signIn({ provider: "github" }, {
      shouldCreateUser: true,
    }).then(console.log);
  }, []);

  return (
    <div>
      <button type="button" onClick={google}>
        Login with Google
      </button>
      <button type="button" onClick={github}>
        Login with GitHub
      </button>
    </div>
  );
}

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
        headers: { location: "/login" },
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
          name: `${""}-${key}`,
          value: "",
          maxAge: -1,
        }))
        .forEach((cookie) => setCookie(headers, cookie));
    }

    return new Response(null, { status: 200, headers });
  },
};
