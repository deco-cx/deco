![Deco web editor](https://github.com/deco-cx/deco/assets/1633518/67124408-f40f-4e8f-9ccb-4982f0144363)
<hr/>

<a href="https://deno.land/x/deco" target="_blank"><img alt="Deno Land" src="https://img.shields.io/badge/denoland-deco-green" /></a>
  &nbsp;
<a href="https://deco.cx/discord" target="_blank"><img alt="Discord" src="https://img.shields.io/discord/985687648595243068?label=Discord&color=7289da" /></a>
  &nbsp;
  <a href="https://x.com/deco_frontend" target="_blank"><img src="https://img.shields.io/twitter/follow/deco_frontend" alt="Deco Twitter" /></a>
&nbsp;
  ![Build Status](https://github.com/deco-cx/deco/workflows/ci/badge.svg?event=push&branch=main)

<hr/>

💻 **Deco is the other side of Code: an open-source web editor** for building high-performance apps.

👁️ It turns your **TypeScript code into a visual no-code editor**, right on the web.

⚡ It gives you **visibility over performance both in UI and data fetching,** accelerating the creation of **high-performance websites.**

⚙ It's focused on **reusability and composability** of UI components (**Sections**) and API integrations (**Loaders** and **Actions**). 

📤 Sections, Loaders and Actions can be **packaged and installed with one click as Apps.** 


## Get started on our playground

Deco combines the best of **visual page editing** (like Webflow) and the ability for **app composition at the admin level** (like Wordpress), allowing for new features to be installed and managed in a few minutes, with no code. 

To start building right now, go to https://play.deco.cx and follow the instructions to run a Deco project locally.
&nbsp;

![CleanShot 2023-11-14 at 20 55 32](https://github.com/deco-cx/deco/assets/1633518/e6f0d232-406d-4a20-8362-bd1cc8018b00)

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


## Deploy to your own infrastructure

The deno project created with Deco is completely standalone — all of the CMS information is neatly packed in a JSON file along with the code.

This means you can deploy a Deco project easily to any hosting platform you want.

> ⚠️ Self-hosting the editor itself is coming in early 2024. Bear with us as we refactor some innards before we can invite more developers to extend it! We're looking forward to it.

## Deploy to the deco.cx edge - FREE for personal projects

You can also deploy any Deco app to [deco.cx](https://www.deco.cx/en) — the managed infrastructure by the authors of this project. 

**It's free for unlimited sites up to 5,000 pageviews monthly!**

With any [deco.cx](https://www.deco.cx/en) subscription, you also get: 

- Managed edge infrastructure with 3-second deploy
- Managed Web Analytics by Plausible
- Managed Observability with tracing and error logging by HyperDX
- Access to **ALL** premium deco.hub apps
- Infinite revision history for all CMS changes
- Team support with roles and permissions
- Guest support (for allowing your customers to edit their sites).
- And a bunch of other features we launch every month :)

## Documentation

Explore the capabilities of Deco further in our comprehensive documentation. Learn how to craft Sections, Loaders, Apps and much more. Go to [https://deco.cx/docs](https://www.deco.cx/docs/en/overview).

## Why use Deco?

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

## Motivation

Deco aims to radically simplify web development — like it was in the 90s, but with all the modern good stuff baked in. We propose that this starts by elevating TypeScript into a globally shared vocabulary of types that bridge the gap between interfaces and APIs. The simplicity of defining a type and getting auto-completions with multiple matching integrations from a community of Deco apps is a game-changer for developer productivity — both human and AI. It's a shift towards a more collaborative and efficient web development paradigm, where the community's collective effort translates into individual project success. No more reinventing the wheel, no more silos, no more wasted time. Just focusing on customer needs, **getting the data from wherever you need,** when you need it, and **allowing everyone in the team to create and publish great content** with that data, safely.

## Community

Join the community on [deco.cx Discord Server](https://deco.cx/discord). Share your apps, explore others' creations, and contribute to the shared vocabulary that makes Deco a thriving ecosystem.

## Contribute

We welcome contributions! Whether you’re fixing bugs, improving the documentation, or proposing new features, your efforts are valuable. Check out our contribution guidelines to get started.

## Thanks to all contributors

<a href="https://github.com/deco-cx/deco/graphs/contributors">
  <img src="https://contributors-img.web.app/image?repo=deco-cx/deco" />
</a>
