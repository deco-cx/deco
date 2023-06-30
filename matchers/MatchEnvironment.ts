/**
 * @title {{environment}}
 */
export interface Props {
  environment: "production" | "development";
}

/**
 * @title Environment Matcher
 */
const MatchEnvironment = ({ environment }: Props) => {
  const deploymentId = Deno.env.get("DENO_DEPLOYMENT_ID") || "";

  return environment === "production"
    ? deploymentId !== ""
    : deploymentId === "";
};

export default MatchEnvironment;
