import { Route } from "../flags/audience.ts";

export interface Redirects {
  redirects: Array<
    { from: string; to: string; type?: "temporary" | "permanent" }
  >;
}

export default function redirects(
  props: Pick<Redirects, "redirects">,
): Route[] {
  const routes: Route[] = props.redirects.map(({ from, to, type }) => ({
    pathTemplate: from,
    handler: {
      value: {
        __resolveType: "$live/handlers/redirect.ts",
        to,
        type,
      },
    },
  }));

  return routes;
}
