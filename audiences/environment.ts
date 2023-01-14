export interface Props {
  environment: "production" | "development";
}

export default function environmentAudience(
  { environment }: Props,
  _: Request,
): boolean {
  const deploymentId = Deno.env.get("DENO_DEPLOYMENT_ID") || "";

  return environment === "production"
    ? deploymentId !== ""
    : deploymentId === "";
}
