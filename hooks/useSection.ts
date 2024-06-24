import type { ComponentType } from "preact";
import { useContext } from "preact/hooks";
import { SectionContext } from "../components/section.tsx";
import { IS_BROWSER } from "../deps.ts";
import { FieldResolver } from "../engine/core/resolver.ts";

import { Murmurhash3 } from "../deps.ts";

const hasher = new Murmurhash3();

export type Options<P> = {
  /** Section props partially applied */
  props?: Partial<P extends ComponentType<infer K> ? K : P>;

  /** Path where section is to be found */
  href?: string;
};

export const useSection = <P>(
  { props = {}, href }: Pick<Options<P>, "href" | "props"> = {},
) => {
  const ctx = useContext(SectionContext);
  const revisionId = ctx?.revision;
  const cbString = `${revisionId}|${ctx?.context.state.vary.sort().join()}`;
  hasher.hash(
    cbString,
  );
  const cb = hasher.result();
  hasher.reset();

  if (IS_BROWSER) {
    throw new Error("Partials cannot be used inside an Island!");
  }

  if (!ctx) {
    throw new Error("Missing context in rendering tree");
  }

  const { request, renderSalt, context: { state: { pathTemplate } } } = ctx;

  const params = new URLSearchParams([
    ["props", JSON.stringify(props)],
    ["href", href ?? request.url],
    ["pathTemplate", pathTemplate],
    ["renderSalt", `${renderSalt ?? crypto.randomUUID()}`],
    ["framework", ctx.framework],
    ["__cb", `${cb}`],
  ]);

  if ((props as { __resolveType?: string })?.__resolveType === undefined) {
    params.set(
      "resolveChain",
      JSON.stringify(FieldResolver.minify(ctx.resolveChain.slice(0, -1))),
    );
  }

  return `/deco/render?${params}`;
};
