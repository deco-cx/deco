import { CLIENT_NAV_ATTR, PARTIAL_ATTR } from "$fresh/src/constants.ts";
import { ComponentType } from "preact";
import { useContext } from "preact/hooks";
import { SectionContext } from "../components/section.tsx";
import { IS_BROWSER } from "../deps.ts";
import { FieldResolver } from "../engine/core/resolver.ts";

type Options<P> = {
  /** Section props partially applied */
  props?: Partial<P extends ComponentType<infer K> ? K : P>;

  /** Path where section is to be found */
  href?: string;

  mode?: "replace" | "append" | "prepend";
};

export const usePartialSection = <P>(
  { props = {}, href, mode = "replace" }: Options<P> = {},
) => {
  const ctx = useContext(SectionContext);

  if (IS_BROWSER) {
    throw new Error("Partials cannot be used inside an Island!");
  }

  if (!ctx) {
    throw new Error("Missing context in rendering tree");
  }

  const {
    resolveChain,
    request,
    renderSalt,
    context: { state: { pathTemplate } },
  } = ctx;

  const params = new URLSearchParams([
    ["props", JSON.stringify(props)],
    ["href", href ?? request.url],
    ["pathTemplate", pathTemplate],
    ["renderSalt", `${renderSalt ?? crypto.randomUUID()}`],
    [
      "resolveChain",
      JSON.stringify(FieldResolver.minify(resolveChain.slice(0, -1))),
    ],
    ["fresh-partial", "true"],
    ["partialMode", mode],
  ]);

  return {
    [CLIENT_NAV_ATTR]: true,
    [PARTIAL_ATTR]: `/deco/render?${params}`,
  };
};
