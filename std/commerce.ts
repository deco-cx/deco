import type { MiddlewareHandler } from "$fresh/server.ts";
import type { LiveState } from "$live/types.ts";
import {
  createClient as createClientVTEX,
  Options as VTEXOptions,
} from "./commerce/clients/vtex.ts";

type CommerceOptions = VTEXOptions;

const clientsByPlatform = {
  vtex: createClientVTEX,
};

type Platforms = typeof clientsByPlatform;

type Client = ReturnType<Platforms[keyof Platforms]>;

export type WithCommerce<S> = S & {
  client: Client;
};

export const withLiveCommerce = (options: CommerceOptions) =>
(
  handler: MiddlewareHandler<LiveState>,
): MiddlewareHandler<WithCommerce<LiveState>> =>
(req, ctx) => {
  ctx.state.client = clientsByPlatform[options.platform](options);

  return handler(req, ctx);
};

const isClientPlatform = <P extends Client["platform"]>(
  client: any,
  platform: P,
): client is ReturnType<typeof clientsByPlatform[P]> =>
  client.platform === platform;

export const getClientPlatform = <P extends Client["platform"]>(
  client: any,
  platform: P,
) => {
  if (isClientPlatform(client, platform)) {
    return client;
  }
  
  throw new Error(
    `Client is not from platform ${platform}. Did you include withLiveCommerce on _middleware.ts?`,
  );
};
