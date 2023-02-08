import { MatchFunction } from "$live/std/types.ts";
import { LiveState } from "$live/types.ts";

export interface Props {
  environment: "production" | "development";
}

const MatchEnvironment: MatchFunction<Props, unknown, LiveState> = (
  _req,
  __ctx,
  { environment }: Props,
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
