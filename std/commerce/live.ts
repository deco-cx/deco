import type { MiddlewareHandler } from "$fresh/server.ts";
import type { LiveState } from "$live/types.ts";
import {
  createClient as createClientVTEX,
  Options as VTEXOptions,
} from "./vtex/client.ts";
import {
  createClient as createClientShopify,
  Options as ShopifyOptions,
} from "./shopify/client.ts";

type CommerceOptions = VTEXOptions | ShopifyOptions;

const clientsByPlatform = {
  vtex: createClientVTEX,
  shopify: createClientShopify,
};

type Platforms = typeof clientsByPlatform;

type Clients = {
  [P in keyof Platforms]: ReturnType<Platforms[P]>;
};

export type WithCommerce<S> = S & {
  clients: Clients;
};

export const withLiveCommerce =
  (options: CommerceOptions | CommerceOptions[]) =>
  (
    handler: MiddlewareHandler<LiveState>,
  ): MiddlewareHandler<WithCommerce<LiveState>> =>
  (req, ctx) => {
    const allOptions = Array.isArray(options) ? options : [options];

    const allClients = allOptions.reduce((acc, option) => {
      const platform = option.platform;

      acc[platform] = clientsByPlatform[platform](option as any) as any;

      return acc;
    }, {} as Clients);

    ctx.state.clients = allClients;

    return handler(req, ctx);
  };

export const getClientPlatform = <P extends CommerceOptions["platform"]>(
  clients: any,
  platform: P,
) => {
  const client = (clients as Clients)[platform];

  if (!client) {
    throw new Error(
      `Client for platform ${platform} not found. Did you include withLiveCommerce on _middleware.ts?`,
    );
  }

  return client;
};
