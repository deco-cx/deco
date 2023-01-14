export interface VTEXConfig {
  account: string;
  key: string;
  token: string;
}

export type Props = {
  production: VTEXConfig;
  staging?: VTEXConfig;
};

export default function VTEXAccount(props: Props, req: Request): VTEXConfig {
  const deploymentId = Deno.env.get("DENO_DEPLOYMENT_ID") || "";
  console.log("VTEXAccount", deploymentId, props, req);

  // Use staging if not in a deployment
  return deploymentId !== "" || !props.staging
    ? props.production
    : props.staging;
}
