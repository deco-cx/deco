export interface Props {
  environment: "production" | "development";
}

const MatchEnvironment = ({ environment }: Props) => {
  const deploymentId = Deno.env.get("DENO_DEPLOYMENT_ID") || "";

  return {
    isMatch:
      environment === "production" ? deploymentId !== "" : deploymentId === "",
    duration: "request",
  };
};

export default MatchEnvironment;
