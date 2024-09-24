/** @jsxRuntime automatic */ /** @jsxImportSource preact */ // deno-lint-ignore-file no-explicit-any
import { isInvokeCtx } from "../blocks/loader.ts";
import { withSection } from "../components/section.tsx";
import { singleFlight } from "../engine/core/utils.ts";
import { buildInvokeFunc } from "../utils/invoke.server.ts";
import { deviceOf, isBot as isUABot } from "../utils/userAgent.ts";
export const applyConfig = (func)=>async ($live)=>{
    return await func.default($live);
  };
export const applyConfigFunc = (func)=>async ($live)=>{
    const resp = await func.default($live);
    return typeof resp === "function" ? resp : ()=>resp;
  };
/**
 * Creates a unique bag key for the given description
 * @param description the description of the key
 * @returns a symbol that can be used as a bag key
 */ export const createBagKey = (description)=>Symbol(description);
// deno-lint-ignore ban-types
export const fnContextFromHttpContext = (ctx)=>{
  let device = null;
  let isBot = null;
  return {
    ...ctx?.context?.state?.global,
    revision: ctx.revision,
    resolverId: ctx.resolverId,
    monitoring: ctx.monitoring,
    get: ctx.resolve,
    response: ctx.context.state.response,
    bag: ctx.context.state.bag,
    isInvoke: isInvokeCtx(ctx),
    invoke: buildInvokeFunc(ctx.resolve, {
      propagateOptions: true
    }, {
      isInvoke: true,
      resolveChain: ctx.resolveChain
    }),
    get device () {
      return device ??= deviceOf(ctx.request);
    },
    get isBot () {
      return isBot ??= isUABot(ctx.request);
    }
  };
};
/**
 *  Applies the given props to the target block function.
 *
 * @template TProps, TResp
 * @param {Object} func - A function with a `default` property.
 * @param {TProps} $live - Props to be applied to the function.
 * @param {HttpContext<{ global: any } & RequestState>} ctx - A context object containing global state and request information.
 * @returns {PromiseOrValue<TResp>} The result of the function call with the applied props.
 */ export const applyProps = (func)=>($live, ctx)=>{
    return func.default($live, ctx.request, fnContextFromHttpContext(ctx));
  };
export const fromComponentFunc = ({ default: Component }, component)=>withSection(component, Component);
const isPreactComponent = (v)=>{
  return typeof v.Component === "function";
};
export const usePreviewFunc = (Component)=>(component)=>{
    return {
      ...isPreactComponent(component) ? component : {
        props: component
      },
      Component
    };
  };
export const newComponentBlock = (type, defaultDanglingRecover)=>({
    type,
    defaultDanglingRecover,
    defaultPreview: (comp)=>comp,
    adapt: fromComponentFunc
  });
export const newSingleFlightGroup = (singleFlightKeyFunc)=>{
  const flights = singleFlight();
  return (c, ctx)=>{
    if (!singleFlightKeyFunc) {
      return ctx.next();
    }
    return flights.do(`${singleFlightKeyFunc(c, ctx)}`, ()=>ctx.next());
  };
};
export const buildImportMapWith = (manifest, importMapBuilder)=>{
  const importMap = {
    imports: {}
  };
  const { baseUrl: _ignoreBaseUrl, name: _ignoreName, ...appManifest } = manifest;
  for (const value of Object.values(appManifest)){
    for (const blockKey of Object.keys(value)){
      importMap.imports[blockKey] = importMapBuilder(blockKey);
    }
  }
  return importMap;
};
export const buildImportMap = (manifest)=>{
  const { baseUrl, name } = manifest;
  if (!URL.canParse("./", baseUrl)) {
    return {
      imports: {}
    };
  }
  const builder = (blockKey)=>blockKey.replace(`${name}/`, new URL("./", baseUrl).href);
  return buildImportMapWith(manifest, builder);
};
