import { LiveConfig } from "$live/types.ts";
import { HandlerContext } from "$fresh/server.ts";

export interface Props {
  environment: "production" | "development";
}

const MatchEnvironment = (
  _req: Request,
  {
    state: {
      $live: { environment },
    },
  }: HandlerContext<unknown, LiveConfig<Props>>,
) => {
  const deploymentId = Deno.env.get("DENO_DEPLOYMENT_ID") || "";

  return {
    isMatch: environment === "production"
      ? deploymentId !== ""
      : deploymentId === "",
    duration: "request",
  };
};

export default MatchEnvironment;
