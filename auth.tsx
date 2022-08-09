/** @jsx h */
import { h } from "preact";
import { useCallback, useEffect } from "preact/hooks";
import { Handlers } from "$fresh/server.ts";
import { setCookie } from "std/http/mod.ts";
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
        }).then((res) => res.json());
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
      redirectTo: "/login",
      shouldCreateUser: true,
    }).then(console.log);
  }, []);
  const github = useCallback(() => {
    getSupabaseClient().auth.signIn({ provider: "github" }).then(console.log);
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
          name: `${""}-${token.key}`,
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
