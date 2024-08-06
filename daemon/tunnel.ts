import { connect } from "jsr:@deco/warp@0.3.1";
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
      const admin = new URL(
        `/sites/${site}/spaces/dashboard?env=${env}`,
        "https://admin.deco.cx",
      );
      const preview = new URL(
        `https://${env}--${site}.deco.site`,
      );

      console.log(
        `\n🐁 deco.cx started environment ${colors.green(env)} for site ${
          colors.brightBlue(site)
        }\n   -> 🌐 ${colors.bold("Preview")}: ${
          colors.cyan(preview.href)
        }\n   -> ✏️ ${colors.bold("Admin")}: ${colors.cyan(admin.href)}\n`,
      );
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
