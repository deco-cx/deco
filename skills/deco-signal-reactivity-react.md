---
title: Signal Reactivity in React (Preact→React Migration Gotcha)
description: Critical gotcha when migrating from Preact to React — reading signal.value in render doesn't re-render; use useSignalValue hook instead.
tags: [signals, react, preact, migration, reactivity]
---

# Signal Reactivity in React (Preact→React Migration Gotcha)

## Problem
When migrating from **@preact/signals** to a React app using module-level signals (e.g. `@decocms/blocks` ReactiveSignal), reading `signal.value` directly in a render function does NOT trigger a component re-render when the signal changes.

**Symptom:** A drawer/modal that should open on click doesn't open. The click handler fires (you see analytics logs), and `displayCart.value = true` executes, but the component doesn't re-render to reflect the new state.

## Root Cause
**Preact signals** automatically subscribe any component that reads `signal.value`. **React signals** (via `@preact/signals-react` or custom implementations using `useSyncExternalStore`) require explicit subscription.

Reading `signal.value` directly in render is a **read without subscription** — React doesn't know to re-render when the value changes.

## Solution
Use the `useSignalValue(sig)` hook (wrapping `useSyncExternalStore`) for every render-time read of a module signal.

```tsx
// ❌ WRONG: drawer won't open
function Drawers() {
  const displayCart = useUI().displayCart; // module signal
  return <input type="checkbox" checked={displayCart.value} />; // no subscription
}

// ✅ CORRECT: drawer opens when displayCart.value changes
import { useSignalValue } from "~/sdk/signal";

function Drawers() {
  const displayCartValue = useSignalValue(useUI().displayCart); // subscribes
  return <input type="checkbox" checked={displayCartValue} />;
}
```

## Key Points
- **Writes in handlers:** `sig.value = x` is fine in event handlers (onClick, onMutate, etc.). No subscription needed for writes.
- **Reads in render:** Any reference to `sig.value` in the component body or render must go through `useSignalValue`.
- **Module-level signals:** This applies to signals from libraries like `@decocms/blocks` (ReactiveSignal) that live outside the React component tree.
- **Per-component effect:** Each component that reads a signal must subscribe independently.

## Example: Drawer Component
```tsx
import { useSignalValue } from "~/sdk/signal";
import { useUI } from "~/sdk/useUI";

function Drawers() {
  const ui = useUI();
  const displayCartValue = useSignalValue(ui.displayCart);
  const displayMenuValue = useSignalValue(ui.displayMenu);

  const handleCartClick = () => {
    ui.displayCart.value = true; // ✅ write is fine here
  };

  return (
    <>
      <button onClick={handleCartClick}>Cart</button>
      {/* ✅ reads use subscribed values */}
      <CartDrawer open={displayCartValue} />
      <MenuDrawer open={displayMenuValue} />
    </>
  );
}
```

## Debugging
If a signal-driven feature "doesn't work," check:
1. Is the write happening? (Look for it in the event handler)
2. Is the read subscribed? (Did you use `useSignalValue`?)
3. Is the component re-rendering? (Check React DevTools Profiler)

If all three are yes and it still fails, check the signal's initial value and whether the signal is being reset somewhere else.

## Reference Implementation
See `src/components/Header/Drawers.tsx` in montecarlo-tanstack after the fix for `displayCart`, `displayMenu`, `displayMenuProducts`, `displayMenuProductsChild`.
