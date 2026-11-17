/**
 * Fast deploy on Cloudflare Workers: the decofile from Cloudflare KV.
 *
 * The Worker build embeds `.deco/blocks`, so without this every content change
 * needs a new build. With a `DECO_KV` binding and `DECO_FAST_DEPLOY=1`, the
 * Worker reads its content from KV instead, under the same keys the TanStack
 * sites use (written by `deco-sync-blocks-to-kv`, @decocms/blocks-cli):
 *
 *   decofile:<id>          the decofile (id = the commit the Worker was built from)
 *   index:revision:<id>    its revision, checked every POLL_INTERVAL_MS
 *   redirect:<id>:<path>   one exact redirect each, outside the decofile
 *
 * The builder writes `decofile:<sha>` before deploying; a content-only push
 * rewrites the live id's keys and the Worker swaps the new decofile in on its
 * next poll. When KV has nothing for this id, or can't be read, the embedded
 * decofile is served, as without fast deploy.
 *
 * Evaluated with the Worker entry, before deco boots: only type imports from
 * deco here.
 */
import type {
  Decofile,
  DecofileProvider,
  ExactRedirect,
  OnChangeCallback,
} from "../../engine/decofile/provider.ts";
import { waitUntil } from "./context.ts";

/** How often (ms) an isolate checks `index:revision:<id>`. */
export const POLL_INTERVAL_MS = 10_000;
/** How long (ms) an isolate trusts a redirect lookup, hit or miss. A redirect
 *  edit doesn't change the decofile revision, so this is its propagation delay. */
export const REDIRECT_TTL_MS = 60_000;
/** Bounded: a crawler walking unique URLs must not grow the isolate. */
const REDIRECT_CACHE_MAX = 2_000;

/** Cloudflare KV's key size limit. */
const MAX_KV_KEY_BYTES = 512;
const utf8 = new TextEncoder();

/**
 * The revision of a stored snapshot: `djb2Hex` from @decocms/blocks
 * (sdk/djb2.ts), which the writer stores as `index:revision:<id>` for exactly
 * these bytes. Copied byte for byte; change it only together with that one.
 */
export const revisionOf = (snapshot: string): string => {
  let hash = 5381;
  for (let i = 0; i < snapshot.length; i++) {
    hash = ((hash << 5) + hash + snapshot.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
};

/** The part of a KV binding this reads. */
export interface KVLike {
  get(key: string): Promise<string | null>;
}

/** A value at `redirect:<id>:<path>`: one rule, or several when sources fold
 *  to the same key (case, trailing slash). `from` is the source as written. */
interface StoredRedirect {
  from?: string;
  to: string;
  status: 301 | 307;
  discardQueryParameters?: boolean;
}

/**
 * The KV key of a redirect source. Copied from `normalizePath` in
 * @decocms/blocks (sdk/redirects.ts), which writes the keys: both sides must
 * agree byte for byte, so change it only together with that one.
 */
export const normalizePath = (path: string): string => {
  let p = path.trim();
  if (p.startsWith("http://") || p.startsWith("https://")) {
    try {
      p = new URL(p).pathname;
    } catch {
      const slashIdx = p.indexOf("/", p.indexOf("//") + 2);
      p = slashIdx >= 0 ? p.slice(slashIdx) : p;
    }
  }
  if (!p.startsWith("/")) p = `/${p}`;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p.toLowerCase();
};

/**
 * The rule for `pathname` in a stored value. Fresh matched an exact redirect
 * against the request path byte for byte (`hrefRoutes` in the website app's
 * router), so the key only narrows the candidates and `from` decides. The last
 * rule wins, as a later block did in Fresh's route map.
 */
export const selectRedirect = (
  value: StoredRedirect | StoredRedirect[],
  pathname: string,
): ExactRedirect | null => {
  const rules = Array.isArray(value) ? value : [value];
  for (let i = rules.length - 1; i >= 0; i--) {
    const rule = rules[i];
    if ((rule.from ?? pathname) !== pathname) continue;
    return {
      to: rule.to,
      type: rule.status === 301 ? "permanent" : "temporary",
      ...(rule.discardQueryParameters ? { discardQueryParameters: true } : {}),
    };
  }
  return null;
};

export interface KVDecofileOptions {
  kv: KVLike;
  /** The commit the Worker was built from (`BUILD_HASH`). */
  deploymentId: string;
  /** The embedded decofile, served when KV has none. */
  fallback: DecofileProvider;
  now?: () => number;
}

export interface KVDecofileProvider extends DecofileProvider {
  /** The revision of the decofile read from KV, once one was. */
  kvRevision(): string | undefined;
}

export function kvDecofileProvider(
  { kv, deploymentId: id, fallback, now = Date.now }: KVDecofileOptions,
): KVDecofileProvider {
  const callbacks = new Set<OnChangeCallback>();
  let current: { state: Decofile; revision: string } | null = null;
  let loaded: Promise<void> | undefined;
  let lastPoll = 0;
  const redirects = new Map<
    string,
    { value: StoredRedirect | StoredRedirect[] | null; expiresAt: number }
  >();

  // The revision is hashed from the bytes actually read, never taken from the
  // `index:revision` key: KV caches each key separately per data center, so a
  // fresh revision can come back next to a stale cached snapshot, and pairing
  // them would pin the old content under the new revision (and seed the page
  // cache with it).
  const read = async () => {
    const snapshot = await kv.get(`decofile:${id}`);
    if (!snapshot) return null;
    return {
      state: JSON.parse(snapshot) as Decofile,
      revision: revisionOf(snapshot),
    };
  };

  // The first read happens in deco's boot, inside the boot request.
  const ensureLoaded = () =>
    loaded ??= read().then((value) => {
      current = value;
      if (!value) {
        console.warn(
          `[deco/kv] decofile:${id} not in KV, serving the embedded decofile`,
        );
      }
    }).catch((err) => {
      console.error(
        `[deco/kv] reading decofile:${id} failed, serving the embedded decofile`,
        err,
      );
    });

  // Fire and forget, kept alive by the request's waitUntil. The change
  // callbacks reinstall deco's apps; they are awaited here so that work never
  // outlives the request that started it (workerd would cancel it, and a later
  // install waiting on it would hang).
  const maybePoll = () => {
    const t = now();
    if (t - lastPoll < POLL_INTERVAL_MS) return;
    lastPoll = t;
    waitUntil(
      (async () => {
        // The key is only a cheap "something changed" signal.
        const revision = await kv.get(`index:revision:${id}`);
        if (!revision || revision === current?.revision) return;
        const next = await read();
        // Still the cached old snapshot: keep polling until it expires.
        if (!next || next.revision === current?.revision) return;
        current = next;
        redirects.clear();
        await Promise.all([...callbacks].map((cb) => cb()));
      })().catch((err) => console.error("[deco/kv] poll failed", err)),
    );
  };

  const touch = async () => {
    await ensureLoaded();
    maybePoll();
  };

  return {
    async state(options) {
      await touch();
      return current?.state ?? fallback.state(options);
    },
    async revision() {
      await touch();
      return current ? `kv:${current.revision}` : fallback.revision();
    },
    onChange(callback) {
      callbacks.add(callback);
      return { [Symbol.dispose]: () => callbacks.delete(callback) };
    },
    kvRevision: () => current?.revision,
    // A failure here (KV, a malformed value) must not fail a page that would
    // render: it is no redirect.
    async exactRedirect(pathname) {
      const key = `redirect:${id}:${normalizePath(pathname)}`;
      // Longer than a KV key can be: the writer keeps such rules in the decofile.
      if (utf8.encode(key).length > MAX_KV_KEY_BYTES) return null;
      try {
        const cached = redirects.get(key);
        let value: StoredRedirect | StoredRedirect[] | null;
        if (cached && cached.expiresAt > now()) {
          value = cached.value;
        } else {
          const raw = await kv.get(key);
          value = raw ? JSON.parse(raw) : null;
          redirects.delete(key);
          redirects.set(key, { value, expiresAt: now() + REDIRECT_TTL_MS });
          if (redirects.size > REDIRECT_CACHE_MAX) {
            redirects.delete(redirects.keys().next().value!);
          }
        }
        return value ? selectRedirect(value, pathname) : null;
      } catch (err) {
        console.error(`[deco/kv] redirect lookup for ${key} failed`, err);
        return null;
      }
    },
  };
}
