import { ConnInfo } from "std/http/mod.ts";
import { isFreshCtx } from "./fresh.ts";

export interface RedirectConfig {
  to: string;
  type?: "permanent" | "temporary";
}

export default function Redirect({ to, type = "temporary" }: RedirectConfig) {
  /** https://archive.is/kWvxu */
  const statusByRedirectType: Record<
    NonNullable<RedirectConfig["type"]>,
    number
  > = {
    "temporary": 307,
    "permanent": 301,
  };

  return (_req: Request, conn: ConnInfo) => {
    const params = isFreshCtx(conn) ? conn.params ?? {} : {};
    const location = to.replace(/:[^\/]+/g, (g) => (params[g.substr(1)]));

    return new Response(null, {
      status: statusByRedirectType[type],
      headers: {
        location,
      },
    });
  };
}
