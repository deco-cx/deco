import type { HandlerContext } from "$fresh/server.ts";
import { Partial, type PartialProps } from "$fresh/src/runtime/Partial.tsx";
import { getSectionID } from "../../../components/section.tsx";
import {
  FieldResolver,
  type Resolvable,
} from "../../../engine/core/resolver.ts";
import { badRequest, HttpError } from "../../../engine/errors.ts";
import type { DecoSiteState, DecoState } from "../../../types.ts";
import { scriptAsDataURI } from "../../../utils/dataURI.ts";

interface Options {
  resolveChain: FieldResolver[];
  props: Record<string, unknown>;
  href: string;
  pathTemplate: string;
  renderSalt?: string;
  partialMode?: PartialProps["mode"];
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
  const partialMode = params.get("partialMode") as
    | PartialProps["mode"]
    | undefined;

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
    partialMode,
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
      state: { ...ctx.state, pathTemplate, renderSalt, partialMode },
      params: params?.pathname.groups,
    },
  };

  let page;

  try {
    page = await ctx.state.resolve(
      { ...section, ...props },
      { resolveChain },
      original,
    );
  } catch (err) {
    if (err instanceof HttpError) {
      // we are creating a section with client side redirect
      // and inserting the same partialId from old section
      // to replace it and do the redirect
      const newResolveChain = [...resolveChain, {
        type: "resolver",
        value: section.__resolveType,
      }];
      const id = getSectionID(
        newResolveChain as FieldResolver[],
      );
      const partialId = `${id}-${renderSalt}`;

      page = {
        props: {
          url: err.resp.headers.get("location"),
        },
        Component: (props: Props) => {
          return (
            <Partial name={partialId}>
              <div>
                <script
                  type="text/javascript"
                  defer
                  src={scriptAsDataURI(snippet, props.url)}
                />
              </div>
            </Partial>
          );
        },
      };
    }
  }

  return ctx.state.resolve(
    { page, __resolveType: "render" },
    undefined,
    original,
  ) as unknown as Promise<Response>;
};
