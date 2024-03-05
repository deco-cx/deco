import { HandlerContext } from "$fresh/server.ts";
import { PartialProps } from "$fresh/src/runtime/Partial.tsx";
import { FieldResolver, Resolvable } from "../../../engine/core/resolver.ts";
import { badRequest } from "../../../engine/errors.ts";
import { DecoSiteState, DecoState } from "../../../types.ts";

interface Options {
  resolveChain: FieldResolver[];
  props: Record<string, unknown>;
  href: string;
  pathTemplate: string;
  renderSalt?: string;
  partialMode?: PartialProps["mode"];
}

const fromRequest = (req: Request): Options => {
  const params = new URL(req.url).searchParams;

  const resolveChain = params.get("resolveChain");
  const props = params.get("props");
  const href = params.get("href");
  const pathTemplate = params.get("pathTemplate");
  const renderSalt = params.get("renderSalt");
  const partialMode = params.get("partialMode") as PartialProps["mode"] | undefined;

  if (!resolveChain) {
    throw badRequest({ code: "400", message: "Missing resolve chain" });
  }
  if (!props) {
    throw badRequest({ code: "400", message: "Missing props" });
  }
  if (!href) {
    throw badRequest({ code: "400", message: "Missing href" });
  }
  if (!pathTemplate) {
    throw badRequest({ code: "400", message: "Missing pathTemplate" });
  }

  return {
    resolveChain: FieldResolver.unwind(JSON.parse(resolveChain)),
    props: JSON.parse(props),
    href,
    pathTemplate,
    renderSalt: renderSalt ?? undefined,
    partialMode: partialMode ?? undefined,
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
  } = fromRequest(req);

  const url = new URL(href, req.url);
  const request = new Request(url, req);
  const params = new URLPattern({ pathname: pathTemplate }).exec(url);

  const resolvables = await ctx.state.resolve({
    __resolveType: "resolvables",
  }) as Record<string, Resolvable>;

  const index = resolveChain.findLastIndex((x) => x.type === "resolvable");

  let section = resolvables[resolveChain[index].value];
  for (let it = 0; it < resolveChain.length; it++) {
    const item = resolveChain[it];
    if (it < index || item.type !== "prop") continue;

    section = section[item.value];
  }

  const original = {
    request,
    context: {
      ...ctx,
      state: { ...ctx.state, pathTemplate, renderSalt },
      params: params?.pathname.groups,
    },
  };

  const page = await ctx.state.resolve(
    { ...section, ...props },
    { resolveChain },
    original,
  );

  return ctx.state.resolve(
    { page, __resolveType: "render" },
    undefined,
    original,
  ) as unknown as Promise<Response>;
};
