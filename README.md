# [Deno Compose](https://denocompose.dev) — Open-Source Webflow alternative for modern web developers.

> Build visually editable apps based on the **PreTTy** stack: **Pre**act, **T**ailwind and **Ty**peScript.

**Deno Compose in an open-source full-stack web framework** that enables developers to accelerate the creation of **high-performance websites,** especially in terms of **Core Web Vitals** and **PageSpeed score,** which have been shown to correlate with **better user experience and higher conversion rates.**

It's based on the concept of **Blocks**, which can represent UI components (**Sections**) and API integrations (**Loaders** and **Actions**). **Blocks can be configured visually in a web admin panel with no code.** They can also be packaged and installed with one click as **Apps.** 

![CleanShot 2023-11-01 at 19 36 20](https://github.com/deco-cx/deco/assets/1633518/bf32f976-7396-46d8-86b0-309966b0e009)


Install some data integrations, a high-performance template, build out some pages and perhaps add a few JSX components yourself with Tailwind (which fit perfectly into the design-token-driven themes). There you go: **your new project is ready to deploy as a simple deno program, at a fraction of the time.** 

## Deno Compose combines the best of visual page editing (like Webflow) and the ability for app composition at the admin level (like Wordpress), allowing for new features to be installed and managed in a few minutes, with no code.

With deno-compose you can:

* Craft modern web apps with a **visual configuration editor** for managing APIs, UIs and content — all in the same place. 
* Compose pre-built features from a **community-driven ecosystem of Apps,** with one-click installation.
* Evolve your Apps with **built-in realtime feature flags,** rolling out code or content to specific audiences.

**Deno Compose Blocks are interoperable:** one's output can be visually configured as another's input in the visual editor, **based on matching TypeScript types.** 

For example, a Product Shelf UI component might depend on a **`Product[]`.** There are many ways to get a `Product[]`, such as fetching it from an ecommerce platform (like [**Shopify**](https://github.com/deco-cx/apps/tree/main/shopify) or [**VTEX**](https://github.com/deco-cx/apps/tree/main/vtex)) or a search optimization provider (like [**Algolia**](https://github.com/deco-cx/apps/tree/main/algolia) or [**Typesense**](https://github.com/deco-cx/apps/tree/main/typesense)). deno-compose will automatically suggest matching integrations based on the defined type from a wide range of available apps, and the developer can choose the one that best fits their needs. **Building UIs can now be abstracted completely from their data integration. Code against a known-type, get tons of first-class integrations, ready-to-deploy.** 

To try out the deno-compose visual editor, navigate to the [deco.cx playground](https://play.deco.cx), choose a template, and experience a simplified yet powerful way to build web apps. 

![CleanShot 2023-11-01 at 19 33 52](https://github.com/deco-cx/deco/assets/1633518/979ceb81-ad62-4fda-ac3b-fee08f2b7486)

> ⚠️ Self-hosting the editor itself is coming in early 2024. Bear with us as we refactor some innards before we can invite more developers to extend it! We're looking forward to it.

## Key Features

* Shared Vocabulary: Define the type you need, and deno-compose auto-completes with multiple matching integrations from a global community of apps. It's TypeScript taken a step further, turning types into a shared vocabulary that powers your UI and API integrations.

* Pre-built Implementations: Speed up your development with ready-to-use Sections, Loaders, and Actions. A treasure trove of pre-built implementations awaits to be discovered and utilized in your projects.

* Community-Driven Ecosystem: Engage with a global community of developers on deco.hub. Share, discover, and collaborate to enrich the shared vocabulary that deno-compose thrives on.

* Simplified Development Workflow: Just define your types, and let deno-compose handle the rest. It streamlines the workflow from type definition to UI rendering and API integration.

* Interoperable: deno-compose facilitates seamless interaction between different apps and platforms. It’s about breaking down silos and fostering a more interconnected web development ecosystem.

## Why Deco

deno-compose aims to radically simplify web development — like it was in the 90s, but with all the modern good stuff baked in. We propose that this starts by elevating TypeScript into a globally shared vocabulary of types that bridge the gap between interfaces and APIs. The simplicity of defining a type and getting auto-completions with multiple matching integrations from a community of deno-compose apps is a game-changer for developer productivity — both human and AI. It's a shift towards a more collaborative and efficient web development paradigm, where the community's collective effort translates into individual project success. No more reinventing the wheel, no more silos, no more wasted time. Just focusing on customer needs, **getting the data from wherever you need,** when you need it, and **allowing everyone in the team to create and publish great content** with that data, safely.

## Documentation

Explore the capabilities of deno-compose further in our comprehensive documentation. Learn how to craft Sections, Loaders, Apps and much more. Go to [https://deco.cx/docs](https://denocompose.dev/docs).

## Community

Join the community on [deco Discord Server](https://deco.cx/discord). Share your apps, explore others' creations, and contribute to the shared vocabulary that makes deno-compose a thriving ecosystem.

## Contribute

We welcome contributions! Whether you’re fixing bugs, improving the documentation, or proposing new features, your efforts are valuable. Check out our contribution guidelines to get started.
