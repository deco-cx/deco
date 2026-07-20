# Deco Skills

A collection of reusable, battle-tested patterns and best practices for building fast, maintainable storefronts with Deco on TanStack Start, React, and VTEX.

## Skills

### [Configurable On-Demand Minicart](./deco-minicart-configuravel.md)
Build an API-frugal, CMS-configurable VTEX minicart with React Query. Zero `getOrCreateCart` on page load, lazy orderForm creation, canonical Minicart shape, micro-skeletons, and toast-vs-drawer toggle.

**Reference:** `montecarlo-tanstack`

### [Slim Add-to-Cart (Fetch Inteligente)](./deco-add-to-cart-slim.md)
Optimize add-to-cart bandwidth from 97 KB → 0.3 KB by returning only essential data on add, deferring full cart hydration to drawer-open intent.

**Benefit:** ~99.7% bandwidth reduction, no duplicate cart fetches.

### [Signal Reactivity in React (Preact→React Migration Gotcha)](./deco-signal-reactivity-react.md)
Critical migration gotcha: reading `signal.value` in render doesn't re-render in React. Use `useSignalValue` hook instead.

**Symptom:** Drawer/modal doesn't open on click, but analytics logs fire.

### [Micro-Skeletons Without Layout Shift](./deco-micro-skeletons.md)
Implement fine-grained loading states per line/section using pulse-in-place (not fixed boxes) to preserve exact dimensions and avoid CLS violations.

**Pattern:** Disable the real widget, don't hide it.

### [Navigation Prefetch (HTML + SPA)](./deco-nav-prefetch.md)
Combine HTML prefetch-on-hover (nav links, using bagaggio/instant.page) with SPA Link wrapper prefetch (product cards) for perceived performance gains.

**Benefit:** Category pages prefetch on nav hover; PDPs prefetch on card hover.

## Using These Skills

1. Pick a skill relevant to your use case.
2. Read the full skill document for context, gotchas, and trade-offs.
3. Copy the reference implementation patterns into your project.
4. Follow the verification checklist to validate the integration.

## Reference Implementations

All skills are tested in production at:
- **montecarlo-tanstack** — TanStack Start + React + VTEX, Deco framework

## Contributing

Found a gotcha not documented here? Have a better pattern? Open a PR or discussion — these skills are living docs.
