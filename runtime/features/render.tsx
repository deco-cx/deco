/** @jsxRuntime automatic */
/** @jsxImportSource preact */

import type { Page } from "../../blocks/page.tsx";
import { getSectionID } from "../../components/section.tsx";
import type { FieldResolver, Resolvable } from "../../engine/core/resolver.ts";
import { HttpError } from "../../engine/errors.ts";
import { useScriptAsDataURI } from "../../hooks/useScript.ts";
import { logger } from "@deco/deco/o11y";
import type { AppManifest } from "../../types.ts";
import { useFramework } from "../handler.tsx";
import type { State } from "../mod.ts";

export interface Options {
  resolveChain?: FieldResolver[];
  props: Record<string, unknown>;
  href: string;
  pathTemplate: string;
  renderSalt?: string;
  partialMode?: "replace" | "prepend" | "append";
  framework: "fresh" | "htmx";
}

export interface Props {
  url: string;
}

const snippet = (url: string) => {
  globalThis.location.href = url;
};

export interface RenderResponse {
  page: Page;
  shouldCache: boolean;
}
export const render = async <TAppManifest extends AppManifest = AppManifest>(
  req: Request,
  opts: Options,
  state: State<TAppManifest>,
): Promise<RenderResponse> => {
  const {
    href,
    props,
    resolveChain,
    pathTemplate,
    renderSalt,
    partialMode,
    framework,
  } = opts;

  const url = new URL(href, req.url);
  const request = new Request(url, req);
  const urlPathTemplate = new URL(pathTemplate, "http://localhost:8000");
  const params = new URLPattern({
    pathname: urlPathTemplate.pathname,
    ...(urlPathTemplate.search ? { search: urlPathTemplate.search } : {}),
  }).exec(url);

  const resolvables = await state.resolve({
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

  const context = {
    request,
    context: {
      state: {
        ...state,
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
    page = await state.resolve(
      { ...section, ...props },
      resolveChain ? { resolveChain } : undefined,
      context,
    );
    shouldCache = req.method === "GET";
  } catch (err) {
    logger.error(
      `Error ocurred while rendering page: ${(err as Error).stack}`,
      {
        url: url.toString(),
        pathTemplate,
        section: {
          __resolveType: section?.__resolveType,
        },
        props,
      },
    );
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

      page = {
        props: {
          url: err.resp.headers.get("location"),
        },
        Component: (props: Props) => {
          const binding = useFramework();
          return (
            <binding.Wrapper id={partialId}>
              <div>
                {props.url && (
                  <script
                    type="text/javascript"
                    defer
                    src={useScriptAsDataURI(snippet, props.url)}
                  />
                )}
              </div>
            </binding.Wrapper>
          );
        },
      };
    }
  }
  return { page, shouldCache };
};
