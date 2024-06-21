import { connect } from "jsr:@deco/warp@0.2.7";
import { parse } from "std/flags/mod.ts";
import * as colors from "std/fmt/colors.ts";

export interface TunnelRegisterOptions {
  env: string;
  site: string;
  port: string;
}
export async function register({ env, site, port }: TunnelRegisterOptions) {
  const domain = `${env}--${site}.deco.site`;
  const localAddr = `http://localhost:${port}`;
  await connect({
    domain,
    localAddr,
    server: "wss://simpletunnel.deco.site",
    apiKey: Deno.env.get("DECO_TUNNEL_SERVER_TOKEN") ??
      "c309424a-2dc4-46fe-bfc7-a7c10df59477",
  }).then((r) => {
    r.registered.then(() => {
      console.log(colors.green(
        `Server running on https://${domain} -> ${localAddr}`,
      ));
    });
    return r.closed.then(async () => {
      console.log("tunnel connection error retrying in 500ms...");
      await new Promise((resolve) => setTimeout(resolve, 500));
      return register({ env, site, port });
    });
  }).catch(async (_err) => {
    console.log("tunnel connection error retrying in 500ms...");
    await new Promise((resolve) => setTimeout(resolve, 500));
    return register({ env, site, port });
  });
}

const paramsIsValid = (
  options: TunnelRegisterOptions | Partial<TunnelRegisterOptions>,
): options is TunnelRegisterOptions => {
  return !!options.env && !!options.site && !!options.port;
};

if (import.meta.main) {
  const parsedArgs = parse(Deno.args, {
    string: ["env", "site", "port"],
  });
  if (paramsIsValid(parsedArgs)) {
    await register(parsedArgs);
  } else {
    console.error(`params ${parsedArgs} are not valid`);
  }
}
