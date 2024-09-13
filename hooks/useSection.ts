import type { ComponentType } from "preact";
import { useContext } from "preact/hooks";
import { SectionContext } from "../components/section.tsx";
import { FieldResolver } from "../engine/core/resolver.ts";

import { Murmurhash3 } from "../deps.ts";

const hasher = new Murmurhash3();

// List from cloudflare APO https://developers.cloudflare.com/automatic-platform-optimization/reference/query-parameters
/** List of querystring that should not vary cache */
const BLOCKED_QS = new Set<string>([
  "ref",
  "fbclid",
  "fb_action_ids",
  "fb_action_types",
  "fb_source",
  "mc_cid",
  "mc_eid",
  "gclid",
  "dclid",
  "_ga",
  "campaignid",
  "adgroupid",
  "_ke",
  "cn-reloaded",
  "age-verified",
  "ao_noptimize",
  "usqp",
  "mkt_tok",
  "epik",
  "ck_subscriber_id",
]);

/** Returns new props object with prop __cb with `pathname?querystring` from href */
const createStableHref = (href: string): string => {
  const hrefUrl = new URL(href!, "http://localhost:8000");
  hrefUrl.searchParams.forEach((_: string, qsName: string) => {
    if (BLOCKED_QS.has(qsName)) hrefUrl.searchParams.delete(qsName);
  });
  hrefUrl.searchParams.sort();
  return `${hrefUrl.pathname}?${hrefUrl.search}`;
};

export type Options<P> = {
  /** Section props partially applied */
  props?: Partial<P extends ComponentType<infer K> ? K : P>;

  /** Path where section is to be found */
  href?: string;
};

export const useSection = <P>(
  { props = {}, href }: Pick<Options<P>, "href" | "props"> = {},
): string => {
  const ctx = useContext(SectionContext);
  if (typeof document !== "undefined") {
    throw new Error("Partials cannot be used inside an Island!");
  }

  if (!ctx) {
    throw new Error("Missing context in rendering tree");
  }

  const revisionId = ctx?.revision;
  const vary = ctx?.context.state.vary.build();
  const { request, renderSalt, context: { state: { pathTemplate } } } = ctx;

  const hrefParam = href ?? request.url;
  const cbString = [
    revisionId,
    vary,
    createStableHref(hrefParam),
    ctx?.deploymentId,
  ].join("|");
  hasher.hash(cbString);
  const cb = hasher.result();
  hasher.reset();

  const params = new URLSearchParams([
    ["props", JSON.stringify(props)],
    ["href", hrefParam],
    ["pathTemplate", pathTemplate],
    ["renderSalt", `${renderSalt ?? crypto.randomUUID()}`],
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
