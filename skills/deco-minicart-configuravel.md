---
title: Configurable On-Demand Minicart (TanStack / React Query)
description: Build an API-frugal, CMS-configurable VTEX minicart for Deco storefronts on TanStack Start with React Query. No getOrCreateCart on page load, lazy orderForm creation, canonical Minicart shape, micro-skeletons, and toast-vs-drawer toggle.
reference: montecarlo-tanstack
tags: [minicart, react-query, vtex, performance, cms, ux]
---

# Configurable On-Demand Minicart (TanStack / React Query / VTEX)

Turn a VTEX minicart into an API-frugal, CMS-configurable, replicable component on `@decocms/start` (TanStack Start / React / Cloudflare) with `@decocms/apps-vtex@7.20+`.

**Reference implementation:** Monte Carlo (`montecarlo-tanstack`).

## Goals this Delivers

1. **Zero `getOrCreateCart` calls on page load / F5.** The cart is a react-query query gated so a returning shopper reloading a page triggers ZERO orderForm calls. Header badge renders from a lightweight `cart_item_count` cookie instead.
2. **Empty cart without API calls.** A cookieless visitor opening the drawer sees an empty state with zero API calls; the orderForm is created only on the first add-to-cart.
3. **Canonical `Minicart` shape.** Adopt the platform-agnostic `Minicart` type from `@decocms/apps-vtex/utils/minicart` so totals, currency, locale, and free-shipping math come from one boundary conversion, not ad-hoc field digging.
4. **Micro-skeletons without layout shift.** Per-line quantity/price skeletons + footer total skeleton via pulse-in-place (not fixed boxes), preserving exact dimensions and preventing row collapse.
5. **CMS-editable config + composable shelf.** A loader-based config with live Preview (Farm pattern) + a slot for dropping product shelves inside the cart via `SectionRenderer`.
6. **Toast-vs-drawer toggle.** A "notification (toast)" switch: ON (default) = toast on add + drawer stays closed; OFF = drawer auto-opens. Driven by CMS config.

## Architecture

### On-Demand React Query Cart

`src/sdk/cart/` holds the core SDK:

- **`queries.ts`** — `cartKeys`, orderForm cookie helpers, the `cart_item_count` badge cookie, and `shouldFetchCart(displayCartIntent)` (the fetch gate).
- **`useCartQuery.ts`** — `useCart()`: react-query query + optimistic mutations. Exposes legacy signal-shaped surface (`cart.value`, `loading.value`) AND the canonical `minicart` via `useMemo`.
- **`config.ts`** — Module-level `cartConfig` signal + `setCartConfig` (toast, free-shipping threshold, coupon toggle, checkout href). Read by add-button and toast island without prop drilling.

**The fetch gate** is the heart of goal #1/#2:
```ts
// shouldFetchCart(intent) — fetch ONLY when the shopper intends to open AND a cart exists
// (a persisted orderFormId cookie OR a mutation ran this session).
return displayCartIntent && (Boolean(readOrderFormCookie()) || _mutationRanThisSession);
```

Badge count is served from the `cart_item_count` cookie (written on every commit + optimistic patch), read client-only in a `useEffect` to avoid SSR hydration mismatch.

### Invoke vs Direct Fetch (Critical Reconciliation)

`@decocms/apps-vtex@7.20`'s stock `hooks/useCart` does browser `fetch("/api/checkout/pub/orderForm")` — only works on a VTEX-proxied domain. Deco storefronts on custom domains do NOT proxy `/api/checkout`; they use the `invoke` server-function proxy.

**Do NOT adopt the stock hook as-is.** Instead **graft** the pure/portable parts:

- The canonical type `Minicart` (`@decocms/apps-commerce/types`)
- The transform `vtexOrderFormToMinicart` (`@decocms/apps-vtex/utils/minicart`)
- The `loaders/minicart` "empty shell when no cookie" pattern

onto your existing `invoke`-based, on-demand local cart. Compute `minicart` with `useMemo`:

```ts
const minicart = useMemo(() => data ? vtexOrderFormToMinicart(data, {
  freeShippingTarget: config.freeShippingTarget,
  checkoutHref: config.checkoutHref,
  enableCoupon: config.enableCoupon,
}) : null, [data, config.freeShippingTarget, config.checkoutHref, config.enableCoupon]);
```

**Alternative (out of scope):** Reverse-proxy `/api/checkout` → VTEX at the edge to use the stock hook directly. Document, don't implement.

### CMS Config as Loader with Preview (Not a Section)

The minicart drawer is a **layout-shell overlay** (always mounted in `Header/Drawers`, opened by a global `displayCart` signal). It is NOT a page section — don't try to make it one.

- **`src/loaders/minicart.tsx`** — Identity loader returning `MinicartConfig` (rich JSDoc: `freeShippingTarget`, `enableCoupon`, `checkoutHref`, `variant`, `showAddToCartToast`, `addedToast`, `emptyState`, `shelfSections?: Section[]`). Also `export const Preview = (config) => JSX` — a self-contained HTML preview of the configured minicart open and populated (Farm pattern, e.g. `deco-sites/farmrio/loaders/Layouts/Tags.tsx`). Keep Preview dependency-free (no runtime hooks).
- **Header receives flat config object** (`cart.config?: MinicartConfig`), passes it through to `Drawers → Cart`. No `SectionRenderer` wrapping the drawer.
- **Composable shelf slot** — `common/Cart.tsx` renders `shelfSections` via `SectionRenderer` so the admin can drop a product shelf (Granado style) inside the cart. Scope is localized.

## File Map (Copy/Adapt per Site)

| File | Role |
|---|---|
| `src/sdk/cart/queries.ts` | Fetch gate, orderForm + `cart_item_count` cookies |
| `src/sdk/cart/useCartQuery.ts` | `useCart()`, react-query, optimistic mutations, `minicart` graft |
| `src/sdk/cart/config.ts` | `cartConfig` signal + `setCartConfig` |
| `src/loaders/minicart.tsx` | `MinicartConfig` + identity loader + `Preview` |
| `src/components/miniCart/common/Cart.tsx` | Drawer body, empty state, shelf slot, micro-skeletons |
| `src/components/miniCart/vtex/Cart.tsx` | Adapter: `minicart.storefront` → BaseCart props |
| `src/components/miniCart/AddedToCartToast.tsx` | Toast island (photo, price, type, message) |
| `src/components/Header/Drawers.tsx` | Hosts drawer + toast; **subscribes display signals via `useSignalValue`** |
| `src/components/Header/Header.tsx` | Publishes config via `setCartConfig`, passes to Drawers |
| `src/components/Header/Buttons/Cart/{common,vtex}.tsx` | Badge from cookie + hover prefetch |
| `src/components/Product/AddToCartButton/{common,vtex}.tsx` | Optimistic toast/drawer + real product `image` prop |

## Gotchas (These Cost the Most Time)

### 1. Signal Reactivity (Preact → React)
Reading `signal.value` directly in render does NOT re-render a React component (unlike @preact/signals). 

**Symptom:** Drawer "does not open" — the click fires (analytics logs) and sets `displayCart.value=true`, but nothing re-renders.

**FIX:** Subscribe with `useSignalValue(sig)` (useSyncExternalStore) for every render-time read of a module signal (`displayCart`, `cartConfig`, `cartToast`). Writes in handlers stay `sig.value = x`.

### 2. Optimistic Toast Timing
Fire the toast / open the drawer BEFORE `await onAddItem()`, not after — otherwise feedback is delayed by the server round-trip and never shows if the mutation rejects. The mutation carries its own optimistic patch + rollback.

### 3. Toast Photo
`mapProductToAnalyticsItem` gives `item_url` (product page URL), NOT an image. Thread the real image (`product.image?.[0]?.url`) into the add button and use it for the toast.

### 4. Directory Casing (macOS vs Linux CI)
The git index may hold `minicart`/`ui` lowercase while the macOS working tree shows `miniCart`/`UI`. Import using git-indexed casing (`~/components/minicart/...`) or Linux CI + `tsc` (TS1149/TS1261) breaks. Check with `git ls-files | grep -i <path>`.

### 5. CMS Codegen Migration Blocker (7.20+ Bump)
After bumping to `@decocms/*@7.20+`, the generators (`@decocms/blocks-cli`) write to `.deco/` in a NEW format, but a repo migrated earlier still consumes OLD-format files in `src/server/{cms,admin}/` (from `@decocms/start`). Running the generators does NOT update what the app reads.

**Consequence:** New CMS props (`cart.config`, toast toggle) are code-ready but NOT admin-editable until the repo does the codegen migration (switch `setup.ts` importers to `.deco/` OR regenerate all artifacts consistently).

**Mitigation:** Design runtime defaults so the site behaves correctly WITHOUT any CMS config (e.g. `autoOpenOnAdd: false` → toast active, `freeShippingTarget: 500`). Then editability lands for free once the migration runs.

## Verification Checklist

- **Types:** `npx tsc --noEmit` — compare error COUNT to a pre-change baseline. Zero NEW errors is the bar.
- **Browser (with dev server):**
  - F5 with an existing cart cookie → **no** `orderForm` POST.
  - Drawer opens cookieless → empty state, **zero** API calls.
  - Add-to-cart → orderForm created once; with toast ON → toast (photo/price/type), drawer stays closed; with toast OFF → drawer opens.
  - Change quantity → skeleton only on that line + total, rest stable (no layout shift).
  - Hover on icon with cookie → prefetch cart before click.
- **SSR check:** `curl -s localhost:PORT/ | grep data-qa-minicart` returns nothing (drawer body must not be in SSR HTML).
- **Admin (post-codegen-migration):** Edit Minicart config (free-shipping threshold, coupon toggle, toast label), see shelf composability work, Preview reflects changes.
