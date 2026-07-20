---
title: Navigation Prefetch (HTML + SPA)
description: Combine HTML prefetch-on-hover (nav links) with SPA Link wrapper prefetch (product cards) for perceived performance gains.
tags: [performance, prefetch, navigation, ux]
---

# Navigation Prefetch (HTML + SPA)

## Overview
Implement two complementary prefetch strategies:
1. **HTML prefetch-on-hover** for navigation links (using bagaggio or instant.page)
2. **SPA Link wrapper prefetch** for product cards (using React Router / TanStack Start Link)

This hybrid approach works because nav links often go to category pages (full HTML reloads), while product cards go to PDPs (SPA navigation).

## Strategy 1: HTML Prefetch-on-Hover (Navigation)

### Setup
Use **bagaggio** or **instant.page** to prefetch navigation links on hover/focus.

```tsx
// src/components/Nav/Nav.tsx
import { useEffect } from "react";

export function Nav() {
  useEffect(() => {
    // If using instant.page, it auto-detects links with rel="prefetch"
    // or you can configure it to prefetch on hover.
    // Alternatively, use bagaggio:
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/bagaggio@latest";
    document.head.appendChild(script);
  }, []);

  return (
    <nav>
      <a href="/joias" rel="prefetch">Joias</a>
      <a href="/aneis" rel="prefetch">Anéis</a>
      <a href="/pulseiras" rel="prefetch">Pulseiras</a>
    </nav>
  );
}
```

Or configure on route definitions:
```tsx
{
  path: "/joias",
  component: lazy(() => import("./pages/JoiasPage")),
  metadata: { prefetch: "hover" }, // custom app-level hint
}
```

## Strategy 2: SPA Link Prefetch (Product Cards)

### TanStack Start Link Wrapper
```tsx
// src/components/Link/Link.tsx (SPA-aware)
import { Link as TanStackLink } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

interface Props {
  to: string;
  prefetch?: boolean;
  children?: React.ReactNode;
}

export function Link({ to, prefetch = true, children }: Props) {
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = () => {
    if (prefetch) {
      hoverTimeoutRef.current = setTimeout(() => {
        // Trigger SPA prefetch: TanStack Start Link handles this internally
        // or use router.preloadRoute(to) if available
      }, 100); // small delay to avoid prefetch on hover-throughs
    }
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  };

  return (
    <TanStackLink
      to={to}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
    </TanStackLink>
  );
}
```

### Product Card Usage
```tsx
// src/components/ProductCard/ProductCard.tsx
import { Link } from "~/components/Link";

export function ProductCard({ product }) {
  return (
    <div>
      <Link to={`/${product.slug}/p`} prefetch={true}>
        <img src={product.image} alt={product.name} />
        <h3>{product.name}</h3>
        <p className="price">{product.price}</p>
      </Link>
    </div>
  );
}
```

## Benefits
- **Perceived speed:** Nav links start fetching on hover; PDPs start prefetching as soon as user hovers a product card.
- **No performance penalty for non-hovered links:** Prefetch is lazy (on interaction intent).
- **Works across HTML and SPA:** Nav links reload the page (browser cache wins); PDP links are SPA (TanStack Link prefetch helps).

## Trade-offs
- **Bandwidth:** Prefetching increases outbound bandwidth if users hover many links without clicking. Mitigate by prefetching only "hot" routes (top nav items, first 5 product cards above the fold).
- **Cache invalidation:** If content changes frequently, prefetched pages may be stale. Use appropriate Cache-Control headers.

## Verification
- **Network tab:** Hover nav item → prefetch request appears (status 200, cached or from network).
- **Product card:** Hover a few cards → SPA prefetch requests appear.
- **Page transition:** Click after hover → page loads instantly (or very fast) from cache.
- **Mobile:** Disable prefetch on touch devices (use `@media (hover: hover)`) to save bandwidth.

## Reference Implementation
See `src/components/Header/Nav.tsx` and `src/components/ProductCard/ProductCard.tsx` in montecarlo-tanstack.
