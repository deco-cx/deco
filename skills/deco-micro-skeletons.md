---
title: Micro-Skeletons Without Layout Shift
description: Implement fine-grained loading states per line and section without causing visual collapse or layout thrashing.
tags: [ux, skeletons, performance, css, loading-states]
---

# Micro-Skeletons Without Layout Shift

## Problem
Traditional skeleton screens that swap out the real content with fixed-size placeholder boxes cause **layout shift** (CLS violation) and visual jarring. Example: a cart line's price block is 2 lines when discounted (strikethrough + final price), but the skeleton is 1 line — the row collapses during fetch.

## Solution
**Pulse the real content in place** instead of swapping for boxes. Use `animate-pulse` + `opacity` on the actual DOM while keeping exact dimensions and multi-line structure preserved.

## Patterns

### Per-Line Quantity Skeleton
**❌ Old approach (layout shift):**
```tsx
{isPending ? (
  <div className="skeleton h-9 w-24" />
) : (
  <QuantitySelector ... />
)}
```

**✅ New approach (no shift):**
```tsx
<QuantitySelector
  disabled={loading || isGift || isPending} // stay disabled, not hidden
  quantity={quantity}
  ...
/>
```
The selector is always visible and always takes up the same space. While pending, it's just disabled (the user can't interact, but the visual layout is stable).

### Price Block with Pulse
**❌ Old approach (layout shift):**
```tsx
{isPending ? (
  <div className="skeleton h-5 w-16" />
) : (
  <>
    {sale != list && (
      <span className="text-[#AAA89C] text-xs line-through">
        {formatPrice(list, currency, locale)}
      </span>
    )}
    <span className="text-base font-semibold">
      {formatPrice(sale, currency, locale)}
    </span>
  </>
)}
```

**✅ New approach (no shift):**
```tsx
<div className={`flex flex-col justify-end items-end ${isPending ? 'animate-pulse opacity-40' : ''}`}>
  {sale != list && (
    <span className="text-[#AAA89C] text-xs line-through">
      {formatPrice(list, currency, locale)}
    </span>
  )}
  <span className="text-base font-semibold">
    {formatPrice(sale, currency, locale)}
  </span>
</div>
```
The block stays in the DOM with its 2 lines intact. When pending, it pulses (opacity drop + animation). Exact dimensions are preserved.

### Cart Footer Total
Same pattern:
```tsx
<span
  className={`text-lg font-semibold transition-opacity ${isMutating ? 'animate-pulse opacity-40' : ''}`}
>
  {formatPrice(total, currency, locale)}
</span>
```

## Benefits
- **Zero layout shift:** No CLS violation, no row collapse.
- **Visual feedback:** User still sees loading state (pulse + opacity).
- **No interaction layer:** No need to disable the real widget — it's just dimmed.
- **Semantic:** The actual content stays in the DOM; CSS handles the visual feedback.

## Trade-offs
- The pulse effect is subtle — ensure it's visible enough (opacity 0.4–0.5 works).
- Not suitable for skeleton screens that show "shape hints" (e.g., placeholder text lines) — those need fixed boxes. Use micro-skeletons only for fields that recalculate, not for structure that changes.

## CSS Classes Used
- `animate-pulse` — DaisyUI / Tailwind built-in (oscillates opacity 0.5 ↔ 1).
- `opacity-40` — dims the content while pulsing.
- `transition-opacity` — smooths the opacity change.

## Verification
- **Visual:** Open cart, change quantity. The line doesn't collapse; price pulses in place.
- **CLS:** Lighthouse score doesn't drop due to layout shift.
- **Interaction:** Quantity selector stays clickable (disabled state prevents actual mutation, but the DOM is stable).
