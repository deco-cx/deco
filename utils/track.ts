import { context } from "../live.ts";

export const LIVE_JITSU_KEY = Deno.env.get("LIVE_JITSU_KEY") ??
  "js.9wshjdbktbdeqmh282l0th.c354uin379su270joldy2";

export const sendEvent = (name: string, data?: Record<string, any>) => {
  const { domains: _, ...usefulContext } = context

  return fetch(`https://t.jitsu.com/api/v1/event?token=${LIVE_JITSU_KEY}`, {
    method: "POST",
    body: JSON.stringify({
      api_key: LIVE_JITSU_KEY,
      event_type: name,
      ...usefulContext,
      ...data,
    }),
  });
};
