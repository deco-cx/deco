/**
 * A deadline for each individual outgoing fetch.
 *
 * `utils/patched_fetch.ts` already forwards `RequestContext.signal` to every
 * outbound call, so cancellation exists — but that signal is scoped to the
 * *incoming* request. A hanging upstream is therefore only released when the
 * whole page request is torn down, which on our runner is governed by
 * `REVISION_TIMEOUT_SECONDS` (300s in production). Nothing bounds a single call.
 *
 * That gap is measurable. On one production VTEX store, `outgoing_fetch_duration`
 * recorded 66 calls to a single host in one hour that failed after an average of
 * **26.7s**, plus 21 more averaging 19.9s, while the same host answered a
 * sequential probe in ~470ms. With no admission limit in front of the isolate,
 * calls that hang that long accumulate until the pod stops answering — the
 * upstream degrades partially, but the site goes down.
 *
 * ## Opt-in
 *
 * With `DECO_OUTGOING_FETCH_TIMEOUT_MS` unset or <= 0, `createFetch` returns the
 * fetcher untouched — no wrapper, no allocation, no behaviour change on upgrade.
 * Aborting requests that used to be allowed to run forever is exactly the kind
 * of default that should be proven on one site before it reaches every site, so
 * flipping the default is deliberately left as a follow-up.
 *
 * ## Two things worth weighing before picking a value
 *
 * - **The deadline covers the whole exchange, body included.** `AbortSignal` has
 *   no headers-only mode, so a large slow download can be aborted even when the
 *   upstream answered promptly. Size the value against the biggest legitimate
 *   response, not against TTFB.
 * - **`apps/utils/fetch.ts` retries once** (`retryExceptionOr500`, maxAttempts 1)
 *   on `connection closed before message completed`. Each attempt gets its own
 *   deadline, so the worst case a caller observes is roughly twice the value set
 *   here.
 *
 * A caller-supplied `signal` is preserved rather than replaced — whichever fires
 * first wins. `website/sections/Rendering/Lazy.tsx`, which binds an
 * already-aborted signal to drop deferred sections, keeps behaving identically.
 *
 * Timed-out calls stay visible instead of vanishing: the abort surfaces as a
 * throw, and `fetchLog.ts` records it under
 * `http.response.status_class="error"` with the elapsed duration intact.
 */
const fromEnv = Number.parseInt(
  Deno.env.get("DECO_OUTGOING_FETCH_TIMEOUT_MS") ?? "",
);

/** Milliseconds, or 0 when the feature is off. */
export const DEFAULT_TIMEOUT_MS: number =
  Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 0;

export const createFetch = (
  fetcher: typeof fetch,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): typeof fetch => {
  if (!(timeoutMs > 0)) {
    return fetcher;
  }

  return function fetch(
    input: string | Request | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const deadline = AbortSignal.timeout(timeoutMs);
    const signal = init?.signal
      ? AbortSignal.any([init.signal, deadline])
      : deadline;

    return fetcher(input, { ...init, signal });
  };
};
