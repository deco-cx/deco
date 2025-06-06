import { connect } from "@deco/warp";
import * as colors from "@std/fmt/colors";

export interface TunnelRegisterOptions {
  env: string;
  site: string;
  port: string;
  decoHost?: boolean;
}

const VERBOSE = Deno.env.get("VERBOSE");

export async function register(
  { env, site, port, decoHost }: TunnelRegisterOptions,
) {
  const decoHostDomain = `${env}--${site}.deco.host`;
  const { server, domain } = decoHost
    ? {
      server: `wss://${decoHostDomain}`,
      domain: decoHostDomain,
    }
    : {
      server: "wss://simpletunnel.deco.site",
      domain: `${env}--${site}.deco.site`,
    };
  const localAddr = `http://localhost:${port}`;
  await connect({
    domain,
    localAddr,
    server,
    apiKey: Deno.env.get("DECO_TUNNEL_SERVER_TOKEN") ??
      "c309424a-2dc4-46fe-bfc7-a7c10df59477",
  }).then((r) => {
    r.registered.then(() => {
      const admin = new URL(
        `/sites/${site}/spaces/dashboard?env=${env}`,
        "https://admin.deco.cx",
      );

      console.log(
        `\ndeco.cx started environment ${colors.green(env)} for site ${
          colors.brightBlue(site)
        }\n   -> 🌐 ${colors.bold("Preview")}: ${
          colors.cyan(`https://${domain}`)
        }\n   -> ✏️ ${colors.bold("Admin")}: ${colors.cyan(admin.href)}\n`,
      );
    });
    return r.closed.then(async (err) => {
      console.log(
        "tunnel connection error retrying in 500ms...",
        VERBOSE ? err : "",
      );
      await new Promise((resolve) => setTimeout(resolve, 500));
      return register({ env, site, port });
    });
  }).catch(async (err) => {
    console.log(
      "tunnel connection error retrying in 500ms...",
      VERBOSE ? err : "",
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
    return register({ env, site, port });
  });
}
