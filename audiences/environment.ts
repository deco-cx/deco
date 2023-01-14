export interface Props {
  environment: "production" | "development";
}

export default function randomAudience(
  _: Request,
  { environment }: Props,
): boolean {
  const deploymentId = Deno.env.get("DENO_DEPLOYMENT_ID") || "";

  return environment === "production"
    ? deploymentId !== ""
    : deploymentId === "";
}
