import type { ComponentType } from "preact";
import { useContext } from "preact/hooks";
import { SectionContext } from "../components/section.tsx";
import { FieldResolver } from "../engine/core/resolver.ts";

import { Murmurhash3 } from "../deps.ts";

const hasher = new Murmurhash3();

// Seed list adapted from Cloudflare APO
// (https://developers.cloudflare.com/automatic-platform-optimization/reference/query-parameters),
// extended with ad-network families seen in production traffic on commerce sites.
/** Exact-match querystring names that should not vary cache. */
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
  "msclkid",
  "ttclid",
  "yclid",
  "_ga",
  "_gl",
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
  "_hsenc",
  "_hsmi",
]);

/**
 * Prefix-matched querystring names that should not vary cache. Used for
 * families where individual params are open-ended (e.g. utm_source, utm_medium,
 * utm_id, utm_campaign, utm_content, utm_term — enumerating every variant is
 * impractical, and ad platforms keep inventing new ones).
 */
const BLOCKED_QS_PREFIXES: string[] = [
  "utm_",
  "gad_",
  "dgen_",
];

const ALLOWED_QS = new Set<string>();

export const addBlockedQS = (queryStrings: string[]): void => {
  queryStrings.forEach((qs) => BLOCKED_QS.add(qs));
};

export const addBlockedQSPrefix = (prefixes: string[]): void => {
  for (const p of prefixes) {
    // Empty prefix would make startsWith("") match every param, silently
    // stripping the entire querystring. Skip without throwing so a single bad
    // entry doesn't break the caller.
    if (!p) continue;
    if (!BLOCKED_QS_PREFIXES.includes(p)) {
      BLOCKED_QS_PREFIXES.push(p);
    }
  }
};

export const addAllowedQS = (queryStrings: string[]): void => {
  queryStrings.forEach((qs) => ALLOWED_QS.add(qs));
};

/** Returns new props object with prop __cb with `pathname?querystring` from href */
const createStableHref = (href: string): string => {
  const hrefUrl = new URL(href!, "http://localhost:8000");
  const qsList = [...hrefUrl.searchParams.keys()];

  qsList.forEach((qsName: string) => {
    const shouldRemove = ALLOWED_QS.size > 0
      ? !ALLOWED_QS.has(qsName)
      : (BLOCKED_QS.has(qsName) ||
        BLOCKED_QS_PREFIXES.some((prefix) => qsName.startsWith(prefix)));

    if (shouldRemove) {
      hrefUrl.searchParams.delete(qsName);
    }
  });

  hrefUrl.searchParams.sort();
  return hrefUrl.href;
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
  const stableHref = createStableHref(hrefParam);
  const cbString = [
    revisionId,
    vary,
    stableHref,
    ctx?.deploymentId,
  ].join("|");
  hasher.hash(cbString);
  const cb = hasher.result();
  hasher.reset();

  const params = new URLSearchParams([
    ["props", JSON.stringify(props)],
    ["href", stableHref],
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
