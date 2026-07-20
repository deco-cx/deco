---
title: Slim Add-to-Cart (Fetch Inteligente)
description: Optimize add-to-cart bandwidth by returning only essential data (~0.3KB) on add, deferring full cart hydration to drawer-open intent.
tags: [performance, add-to-cart, fetch, optimization]
---

# Slim Add-to-Cart (Fetch Inteligente)

## Problem
Traditional add-to-cart returns the full VTEX OrderForm (~97 KB) on every add, even though the browser only needs: `orderFormId`, item count, and total. This causes bandwidth waste and network latency spikes.

## Solution
Create a slim server function that runs the add server-side but returns only `{ orderFormId, itemCount, totalQuantity, value }` (~0.3 KB). The full OrderForm is fetched on-demand only when the drawer opens.

## Implementation

### 1. Server Function (Slim Add)
```ts
// src/server/invoke.ts
import { addItemsToCart } from "@decocms/apps-vtex/actions/checkout";

export interface SlimCartResult {
  orderFormId: string;
  itemCount: number;
  totalQuantity: number;
  value: number;
}

const _addItemsToCartSlim = createServerFn({ method: "POST" })
  .inputValidator((data: {
    orderFormId: string;
    orderItems: Array<{ id: string; seller: string; quantity: number }>;
  }) => data)
  .handler(async ({ data }): Promise<SlimCartResult> => {
    // VTEX returns full OrderForm; we extract only what the browser needs.
    const of = await addItemsToCart(data);
    const items = of?.items ?? [];
    return {
      orderFormId: of?.orderFormId ?? data.orderFormId,
      itemCount: items.length,
      totalQuantity: items.reduce((s, it) => s + (it?.quantity ?? 0), 0),
      value: of?.value ?? 0,
    };
  });
```

### 2. Query Hook (On-Demand Gate)
```ts
// src/sdk/cart/useCartQuery.ts
const addItemsMutation = useMutation({
  mutationFn: async (params: { orderItems: Array<{ id: string; seller: string; quantity: number }> }) => {
    markCartMutated();
    const orderFormId = await ensureOrderForm();
    return invoke.vtex.actions.addItemsToCartSlim({ data: { orderFormId, orderItems: params.orderItems } });
  },
  onSuccess: (slim) => {
    // Slim result: only write cookie + badge, don't hydrate full cart here.
    if (slim?.orderFormId) writeOrderFormCookie(slim.orderFormId);
    writeCartCount(slim?.itemCount ?? 0);
    // Invalidate so the next drawer-open (when enabled becomes true) refetches authoritative data.
    queryClient.invalidateQueries({ queryKey: cartKeys.all });
  },
});
```

### 3. Fetch Gate (Intent + Cookie)
```ts
// src/sdk/cart/queries.ts
export function shouldFetchCart(displayCartIntent: boolean): boolean {
  return displayCartIntent && (Boolean(readOrderFormCookie()) || _mutationRanThisSession);
}
```

## Benefits
- **Add bandwidth:** 97 KB → 0.3 KB (~99.7% reduction)
- **No duplicate getOrCreateCart:** The old gate's `mutationRan` term caused the full cart to fetch immediately after add. New gate defers to drawer-open intent.
- **Badge works without full hydration:** `cart_item_count` cookie keeps header badge updated.

## Trade-offs
- Full OrderForm is fetched later (on drawer open), not immediately. This is intentional — the add user usually doesn't open the drawer immediately.
- A user who adds then immediately opens the drawer will see a brief skeleton while fetching. This is acceptable UX.

## Verification
- **Network:** Add-to-cart request is ~0.3 KB; opening drawer triggers the full orderForm fetch.
- **Correctness:** Quantity changes and subsequent adds work correctly with stale data handling.
