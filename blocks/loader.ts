import { newHandlerLikeBlock } from "$live/blocks/utils.ts";

const loaderBlock = newHandlerLikeBlock("loaders");

/**
 * <TResponse>(req:Request, ctx: HandlerContext<any, LiveConfig<TConfig>>) => Promise<TResponse> | TResponse
 * Loaders are arbitrary functions that always run in a request context, it returns the response based on the config parameters and the request.
 */
export default loaderBlock;
