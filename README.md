<p align="center">
  <img src="https://github.com/deco-cx/deco/assets/1633518/ba714da8-514e-4b48-bbec-b7d86377b273" alt="deco" width="210px"/>
</p>
<p align="center">
  <strong>Git-based Visual CMS for Deno, &lt;/>htmx and Tailwind Apps.</strong>
</p>
<p align="center">
  <a href="https://deco.cx">deco.cx</a>
  ·
  <a href="https://deco.cx/docs/en">docs</a>
  ·
  <a href="https://admin.deco.cx">login</a>
  ·
  <a href="https://deco.cx/discord">join our discord</a>
  ·
  <a href="https://x.com/deco_frontend">X</a>
</p>
<p align="center">
  <a href="https://jsr.io/@deco/deco" target="_blank"><img alt="jsr" src="https://jsr.io/badges/@deco/deco" /></a>
  &nbsp;
  <a href="https://deno.land/x/deco" target="_blank"><img alt="Deno Land" src="https://img.shields.io/badge/denoland-deco-green" /></a>
  &nbsp;
  <a href="https://deco.cx/discord" target="_blank"><img alt="Discord" src="https://img.shields.io/discord/985687648595243068?label=Discord&color=7289da" /></a>
  &nbsp;
  <a href="https://x.com/deco_frontend" target="_blank"><img src="https://img.shields.io/twitter/follow/deco_frontend" alt="Deco Twitter" /></a>
  &nbsp;
  <a href="https://github.com/deco-cx/deco/workflows/ci" target="_blank"><img src="https://github.com/deco-cx/deco/workflows/ci/badge.svg?event=push&branch=main" alt="Build Status" /></a>
</p>
<br />

![Deco web editor](https://github.com/deco-cx/deco/assets/1633518/b7599207-07dc-40d3-b124-1e73fbb75d10)

<br />

- **Modern stack focused on performance and JavaScript-independence**
  - Server-side JSX templates
  - ⁠Client-side HTMX interactivity
  - Local development with HTTPS tunnel — edit on the web, commit on your local git.
  - ⁠Native Tailwind Theme Support with multiple Component Libraries supported: DaisyUI, Preline, FloatUI, Shadcn UI
- **Easy for business users and content editors**
  - TypeScript Props to Content Editor UI generator
  - Asset manager with multimedia support
  - Publishing workflow with staging area, immutable releases and immediate rollbacks
  - Roles and permissions for content-only editors **(invite 1 content-editor member for free per site!)**
- **⁠Deploy with one click to any Deno-compatible host**
  - Deno Deploy (Preferred Partner) — Global platform with generous free tier
  - Azion Edge _(Coming soon)_
  - Fly.io _(Coming soon)_
  - Nirvana Cloud _(Coming soon)_
  - Digital Ocean _(Coming soon)_
  - deco.cx PRO hosting: $99 USD/mo for always-on multi-zone deployment on our Enterprise-scale managed infrastructure.

# Getting Started

> [!TIP]
> It takes less than 1 minute to get up and running with Deco.

1. Visit [deco.new](https://deco.new) and choose a template.
2. Choose a name and create a site. This gives you a free [`deco-sites`](https://github.com/deco-sites/) GitHub repository and your very own `*.deco.site` domain.
3. Follow the instructions to clone your repo and run your development server locally, _or_ deploy to Deno Deploy with one click for free. 

**Your site is now ready** to edit with our beautiful visual CMS. All changes will be saved to git!

Now, to get to production, install any of the Hosting apps available in `deco.store` by clicking on "Create new production environment".
  
# TypeScript Props to Visual Content Editor

Deco's core feature is generating a content editor UI from your TypeScript interface `Props`.
For example, declaring a ProductShelf JSX component with these `Props`...

```typescript
import ProductCard, { Layout } from "$store/components/product/ProductCard.tsx";
import type { Product } from "apps/commerce/types.ts";

export interface Props {
  products: Product[] | null;
  title?: string;
  description?: string;
  layout?: {
    headerAlignment?: "center" | "left";
    headerfontSize?: "Normal" | "Large";
  };
  cardLayout?: Layout;
}

export default function ProductShelf(props: Props) { /** JSX Preact + Tailwind UI Section **/ }
```

... will automatically generate this admin UI for you:

![CleanShot 2023-11-14 at 16 51 51](https://github.com/deco-cx/deco/assets/1633518/71f08873-8d62-42ec-9732-81dfa83f300c)

## Documentation

Explore the capabilities of Deco further in our comprehensive documentation. Learn how to craft Sections, Loaders, Apps and much more. Go to [deco.cx/docs/en](https://deco.cx/docs/en).

## Motivation

Deco aims to radically simplify web development — like it was in the 90s, but with all the modern good stuff baked in. We propose that this starts by elevating TypeScript into a globally shared vocabulary of types that bridge the gap between interfaces and APIs. The simplicity of defining a type and getting auto-completions with multiple matching integrations from a community of Deco apps is a game-changer for developer productivity — both human and AI. It's a shift towards a more collaborative and efficient web development paradigm, where the community's collective effort translates into individual project success. No more reinventing the wheel, no more silos, no more wasted time. Just focusing on customer needs, **getting the data from wherever you need,** when you need it, and **allowing everyone in the team to create and publish great content** with that data, safely.

To learn more about why we built deco, visit our [Why We Web](https://deco.cx/why) manifest at https://deco.cx/why.

## Community

Join the community on [deco.cx Discord Server](https://deco.cx/discord). Share your apps, explore others' creations, and contribute to the shared vocabulary that makes Deco a thriving ecosystem.

## Deco's advantages

With **Deco** you can:

* Craft modern web apps with a **visual configuration editor** for managing APIs, UIs and content — all in the same place. 
* Compose pre-built features from a **community-driven ecosystem of Apps,** with one-click installation.
* Evolve your Apps with **built-in realtime feature flags,** rolling out code or content to specific audiences.

**Deco Blocks are interoperable:** one's output can be visually configured as another's input in the visual editor, **based on matching TypeScript types.** 

For example, a Product Shelf UI component might depend on a **`Product[]`.** There are many ways to get a `Product[]`, such as fetching it from an ecommerce platform (like [**Shopify**](https://github.com/deco-cx/apps/tree/main/shopify) or [**VTEX**](https://github.com/deco-cx/apps/tree/main/vtex)) or a search optimization provider (like [**Algolia**](https://github.com/deco-cx/apps/tree/main/algolia) or [**Typesense**](https://github.com/deco-cx/apps/tree/main/typesense)). Deco will automatically suggest matching integrations based on the defined type from a wide range of available apps, and the developer can choose the one that best fits their needs. **Building UIs can now be abstracted completely from their data integration. Code against a known-type, get tons of first-class integrations, ready-to-deploy.** 

To try out our visual editor, navigate to the [deco.cx playground](https://play.deco.cx), choose a template, and experience a simplified yet powerful way to build web apps. 

## Key Features

* Shared Vocabulary: Define the type you need, and Deco auto-completes with multiple matching integrations from a global community of apps. It's TypeScript taken a step further, turning types into a shared vocabulary that powers your UI and API integrations.

* Pre-built Implementations: Speed up your development with ready-to-use Sections, Loaders, and Actions. A treasure trove of pre-built implementations awaits to be discovered and utilized in your projects.

* Community-Driven Ecosystem: Engage with a global community of developers on deco.hub. Share, discover, and collaborate to enrich the shared vocabulary that Deco thrives on.

* Simplified Development Workflow: Just define your types, and let Deco handle the rest. It streamlines the workflow from type definition to UI rendering and API integration.

* Interoperable: Deco facilitates seamless interaction between different apps and platforms. It’s about breaking down silos and fostering a more interconnected web development ecosystem.

## Deploy to your own infrastructure

The deno project created with Deco is completely standalone — all of the CMS information is neatly packed in JSON files along with the code. Deco is merely a git-based editor.

This means you can deploy a Deco project easily to any hosting platform you want. By using our integrated hosting partners, you get full first-class environment support an observability inside Deco.

> [!WARNING]
> Self-hosting the editor itself is coming in early 2025. Bear with us as we refactor some innards before we can invite more developers to extend it! We're looking forward to it.

## Deploy to the deco.cx PRO edge

You can also deploy any Deco app to [deco.cx](https://deco.cx/) — the managed infrastructure by the authors of this project. 

With any [deco.cx subscription](https://deco.cx/en/pricing), you also get: 

- Managed edge infrastructure
- Realtime Web Analytics based on Clickhouse
- Observability with tracing and error logging by HyperDX
- Access to all [deco.store](https://deco.store) apps
- Infinite revision history for all CMS changes
- Team support with roles and permissions
- Guest support (for allowing your customers to edit their sites).
- And a bunch of other features we launch every month :)

## 3P Integrations

Here is a table with the integrations that we have built and the statuses of these projects. 

| Integrations                                                                                    | Home   | PLP   | PDP   | Cart   | Checkout proxy   | Order placed proxy   | My account proxy   |
|:------------------------------------------------------------------------------------------------|:-------|:------|:------|:-------|:-----------------|:---------------------|:-------------------|
| [VTEX](https://github.com/deco-cx/apps/blob/main/vtex/README.md)                                        | ✅     | ✅    | ✅    | ✅     | ✅               | ✅                   | ✅                 |
| [VNDA](https://github.com/deco-cx/apps/blob/main/vnda/README.md)                                        | ✅     | ✅    | ✅    | ✅     | ✅               | ✅                   | ✅                 |
| [Shopify](https://github.com/deco-cx/apps/blob/b072c1fdfab8d5f1647ed42f9dbaae618f28f05f/shopify/README.md) | ✅     | ✅    | ✅    | ✅     | ✅               | ✅                   | ✅                 |
| [Linx](https://github.com/deco-cx/apps/blob/main/linx/README.md)                                        | ✅     | ✅    | ✅    | ✅     | ✅               | ✅                   | ✅                 |
| Linx impulse                                                                                    | ✅     | ✅    | ✅    | ✅     | ✅               | ✅                   | ✅                 |
| [Nuvemshop](https://github.com/deco-cx/apps/blob/main/nuvemshop/README.MD)                                   | ✅     | ✅    | ✅    | ✅     | ✅               | ✅                   | ✅                 |
| [Wake](https://github.com/deco-cx/apps/blob/main/wake/README.md)                                        | ✅     | ✅    | ✅    | ✅     | ✅               | ✅                   | ✅                 |

## Cache env vars (WIP)
| Environment Variable              | Description                                             | Example Value                                          |
|-----------------------------------|---------------------------------------------------------|--------------------------------------------------------|
| `ENABLE_LOADER_CACHE`             | Flag to enable or disable the loader cache              | `true`                                                 |
| `LOADER_CACHE_START_TRESHOLD`     | Cache start threshold                                   | `0`                                                    |
| `WEB_CACHE_ENGINE`                | Defines the cache engine(s) to use                      | `"FILE_SYSTEM,CACHE_API"`                                     |
| `CACHE_MAX_SIZE`                  | Maximum size of the file system cache (in bytes)                    | `1073741824` (1 GB)                                    |
| `CACHE_TTL_AUTOPURGE`                   | Flag to automatically delete expired items from the file system cache (cpu intensive) | `false`                                      |
| `CACHE_TTL_RESOLUTION`                  | Time interval to check for expired items in the file system cache (in milliseconds) | `30000` (30 seconds)                               |
| `CACHE_MAX_AGE_S`                  | Time for cache to become stale | `60` (60 seconds)                              |


## Contribute

We welcome contributions! Whether you’re fixing bugs, improving the documentation, or proposing new features, your efforts are valuable. Check out our contribution guidelines to get started.

## Thanks to all contributors

<a href="https://github.com/deco-cx/deco/graphs/contributors">
  <img src="https://contributors-img.web.app/image?repo=deco-cx/deco" />
</a>

