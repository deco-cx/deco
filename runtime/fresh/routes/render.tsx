import type { HandlerContext } from "$fresh/server.ts";
import type { PartialProps } from "$fresh/src/runtime/Partial.tsx";
import { bindings, getSectionID } from "../../../components/section.tsx";
import {
  FieldResolver,
  type Resolvable,
} from "../../../engine/core/resolver.ts";
import { badRequest, HttpError } from "../../../engine/errors.ts";
import { useScriptAsDataURI } from "deco/hooks/useScript.ts";
import type { DecoSiteState, DecoState } from "../../../types.ts";

interface Options {
  resolveChain?: FieldResolver[];
  props: Record<string, unknown>;
  href: string;
  pathTemplate: string;
  renderSalt?: string;
  partialMode?: PartialProps["mode"];
  framework: "fresh" | "htmx";
}

export interface Props {
  url: string;
}

const snippet = (url: string) => {
  window.location.href = url;
};

const fromRequest = (req: Request): Options => {
  const params = new URL(req.url).searchParams;

  const resolveChain = params.get("resolveChain");
  const props = params.get("props");
  const href = params.get("href");
  const pathTemplate = params.get("pathTemplate");
  const renderSalt = params.get("renderSalt");
  const framework = params.get("framework") ?? "fresh";
  const partialMode = params.get("partialMode") as
    | PartialProps["mode"]
    | undefined;

  if (!props) {
    throw badRequest({ code: "400", message: "Missing props" });
  }

  const parsedProps = JSON.parse(props);

  if (!resolveChain && !parsedProps.__resolveType) {
    throw badRequest({
      code: "400",
      message: "Missing resolve chain or __resolveType on props root",
    });
  }
  if (!href) {
    throw badRequest({ code: "400", message: "Missing href" });
  }
  if (!pathTemplate) {
    throw badRequest({ code: "400", message: "Missing pathTemplate" });
  }

  return {
    props: parsedProps,
    href,
    framework: framework as "fresh" | "htmx",
    pathTemplate,
    renderSalt: renderSalt ?? undefined,
    partialMode: partialMode ?? undefined,
    resolveChain: resolveChain
      ? FieldResolver.unwind(JSON.parse(resolveChain))
      : undefined,
  };
};

export const handler = async (
  req: Request,
  ctx: HandlerContext<unknown, DecoState<unknown, DecoSiteState>>,
) => {
  const {
    href,
    props,
    resolveChain,
    pathTemplate,
    renderSalt,
    partialMode,
    framework,
  } = fromRequest(req);

  const url = new URL(href, req.url);
  const request = new Request(url, req);
  const params = new URLPattern({ pathname: pathTemplate }).exec(url);

  const resolvables = await ctx.state.resolve({
    __resolveType: "resolvables",
  }) as Record<string, Resolvable>;

  let section;

  if (resolveChain) {
    const index = resolveChain.findLastIndex((x) => x.type === "resolvable");
    section = resolvables[resolveChain[index].value];

    for (let it = 0; it < resolveChain.length; it++) {
      const item = resolveChain[it];
      if (it < index || item.type !== "prop") continue;

      section = section[item.value];
    }
  }

  const original = {
    request,
    context: {
      ...ctx,
      state: {
        ...ctx.state,
        pathTemplate,
        renderSalt,
        partialMode,
        framework,
      },
      params: params?.pathname.groups,
    },
  };

  let page;
  let shouldCache = false;

  try {
    page = await ctx.state.resolve(
      { ...section, ...props },
      resolveChain ? { resolveChain } : undefined,
      original,
    );

    shouldCache = req.method === "GET";
  } catch (err) {
    if (err instanceof HttpError) {
      // we are creating a section with client side redirect
      // and inserting the same partialId from old section
      // to replace it and do the redirect
      const newResolveChain = [...resolveChain ?? [], {
        type: "resolver",
        value: section.__resolveType,
      }];
      const id = getSectionID(
        newResolveChain as FieldResolver[],
      );
      const partialId = `${id}-${renderSalt}`;

      const binding = bindings[framework];

      page = {
        props: {
          url: err.resp.headers.get("location"),
        },
        Component: (props: Props) => {
          return (
            <binding.Wrapper id={partialId}>
              <div>
                <script
                  type="text/javascript"
                  defer
                  src={useScriptAsDataURI(snippet, props.url)}
                />
              </div>
            </binding.Wrapper>
          );
        },
      };
    }
  }

  const response = await ctx.state.resolve(
    { page, __resolveType: "render" },
    { propsAreResolved: true },
    original,
  ) as unknown as Response;

  const etag = (ctx.url || new URL(req.url)).searchParams.get("__cb");

  const ifNoneMatch = req.headers.get("if-none-match");
  if (etag && (ifNoneMatch === etag || ifNoneMatch === `W/${etag}`)) {
    return new Response(null, { status: 304, headers: { etag } });
  }

  if (shouldCache && etag) {
    response.headers.set("etag", etag);

    // Stale cache on CDN, but make the browser fetch every single time.
    // We can test if caching on the browser helps too.
    response.headers.set(
      "cache-control",
      "public, max-age=0, must-revalidate, s-maxage=60, stale-while-revalidate=3600, stale-if-error=86400",
    );
  }

  return response;
};
