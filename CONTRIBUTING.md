# Contributing to `@deco/deco`

## Release channels

This repository publishes on two channels:

| Channel | Branch | Example version | JSR resolution |
|---------|--------|-----------------|----------------|
| Stable  | `main` | `1.198.0`       | `jsr:@deco/deco` resolves here |
| Prerelease | `next` | `1.198.0-next.3` | Opt-in only — must reference explicit version |

Both channels publish all three packages (`@deco/deco`, `@deco/scripts`, `@deco/dev`) together to JSR, plus Docker images on `ghcr.io/deco-cx/deco` (and `…/deno2`, `…/ai`, `…/deno2-ai`). Prerelease tags **do not** move the Docker `:latest` tag.

### Targeting `main` (stable)

1. Open a PR with `main` as the base.
2. A bot comments with **Patch / Minor / Major** options.
3. A maintainer (listed in `MAINTAINERS.txt`) reacts with 👍 / 🎉 / 🚀.
4. Merge the PR. The `Release Tagging` workflow bumps the version in the three `deno.json` files, tags the commit, and dispatches the publish workflows.
5. **No reaction = no release.**

### Targeting `next` (prerelease)

1. Open a PR with `next` as the base.
2. A bot comments with **Prerelease Tagging** info.
3. Merge the PR. The `Release Tagging` workflow:
   - Defaults to a **patch** prerelease (`<latest-stable-patch+1>-next.<N>`).
   - A maintainer reaction overrides the base: 👍 patch / 🎉 minor / 🚀 major.
   - `N` auto-increments from the highest existing `<base>-next.*` tag (or `1` if none).
4. **Every merge to `next` publishes a prerelease** — there is no "no release" path.

### Consuming a prerelease

JSR has no dist-tags (unlike npm's `@next`), so consumers opt in explicitly:

```jsonc
// deno.json
{
  "imports": {
    "@deco/deco": "jsr:@deco/deco@1.198.0-next.3"
  }
}
```

Plain `jsr:@deco/deco` (no version specifier) continues to resolve to the latest stable release.

### Promoting `next` → `main`

When a prerelease cycle is ready to ship:

1. Open a PR from `next` into `main`.
2. The bot comments with stable bump options.
3. A maintainer reacts with the appropriate emoji.
4. Merge. The stable `determine-tag` job publishes (e.g., `1.198.0`).

## Branch protection (one-time setup)

`next` must be protected to match `main`: require PR review, status checks, no force-push, no direct push. This requires repo-admin privileges and is configured via the GitHub UI / API, not via this repo.

## Manual release (local fallback)

`scripts/release.ts` exists for local-driven stable releases when the CI flow is unavailable. It does not handle prereleases — use the `next` branch for those.
