import type { ComponentType } from "preact";
import { useContext } from "preact/hooks";
import { SectionContext } from "../components/section.tsx";
import { FieldResolver } from "../engine/core/resolver.ts";

import { Murmurhash3 } from "../deps.ts";

const hasher = new Murmurhash3();
/** Cache burst key */
const CACHE_BURST_KEY: string = "__cb";

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
  "ck_subscriber_id"
]);

/** Returns new props object with prop __cb with `pathname?querystring` from href */
const createPropsFromHref = ( href: string) => {
  const hrefUrl = new URL(href!, 'http://localhost:8000');
  hrefUrl.searchParams.forEach((_: string, qsName: string) => {
    if (BLOCKED_QS.has(qsName)) hrefUrl.searchParams.delete(qsName)
  })
  hrefUrl.searchParams.sort();
  return { [CACHE_BURST_KEY]: `${hrefUrl.pathname}?${hrefUrl.search}` }
}

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
  const revisionId = ctx?.revision;
  const vary = ctx?.context.state.vary.build();
  const cbString = [
    revisionId,
    vary,
    ctx?.deploymentId,
  ].join("|");
  hasher.hash(cbString);
  const cb = hasher.result();
  hasher.reset();

  if (typeof document !== "undefined") {
    throw new Error("Partials cannot be used inside an Island!");
  }

  if (!ctx) {
    throw new Error("Missing context in rendering tree");
  }

  const { request, renderSalt, context: { state: { pathTemplate } } } = ctx;

  const shouldBurstCache = (href?: string): href is string => href !== undefined && Object.keys(props).length === 0

  const params = new URLSearchParams([
    ["props",
      // This is an workaround to vary the cache when useSection is used without props
      JSON.stringify(shouldBurstCache(href) ? createPropsFromHref(href!) : props)],
    ["href", href ?? request.url],
    ["pathTemplate", pathTemplate],
    ["renderSalt", `${renderSalt ?? crypto.randomUUID()}`],
    [CACHE_BURST_KEY, `${cb}`],
  ]);

  if ((props as { __resolveType?: string })?.__resolveType === undefined) {
    params.set(
      "resolveChain",
      JSON.stringify(FieldResolver.minify(ctx.resolveChain.slice(0, -1))),
    );
  }

  return `/deco/render?${params}`;
};
