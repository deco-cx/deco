# Live.ts — the open-source web framework for building evolutionary digital experiences

**What if** you could make your site editable for business users **without** having to choose, learn and integrate a new CMS for each project?

**What if** you could have freedom and safety to evolve your site, **without** bugging developers for a new deploy every ten minutes?

**What if** new sites started off with PageSpeed 99 — and stayed there as they evolve?

**Live.ts unlocks seamless collaboration in teams of developers and business users** who manage high-traffic, mission-critical digital experiences that need to evolve every day.

**Live.ts** allows developers to create `sections` (UI components), `loaders` (data fetchers), `pages` (composed of sections and loaders), and many other types of **blocks** that can then be **easily configured in a visual editor UI by anyone in the team** with realtime changes.

This means business users can now **create and evolve** the content and configuration of their digital experience without the need for developers to deploy changes — all with complete **type-safety**. Developers focus on building these **configurable blocks**, and business users can create completely dynamic pages composed from blocks via UI.

Besides pages, **Live.ts** also lets teams manage **flags, experiments and campaigns** with an instant, global configuration management service optimized for the edge. Using `matcher` functions, configuration changes can be applied to any specific audience. Every change is instantly available to matched users, from gradual rollout of features, to A/B testing content, to targeting specific users with personalized content.

**Live.ts** is designed to be **fast, secure and easy to use**. That's why we built it on top of extraordinary open-source technologies, including [fresh](https://fresh.deno.dev), a framework for building edge-native applications, [supabase](https://supabase.io), a managed Postgres DB and auth wrapper, and [jitsu](https://jitsu.io), a data collector. And **Live.ts** itself is also **open source** and **free.**

We, the creators of **Live.ts**, offer a managed **Live.ts** infrastructure at [deco.cx](https://deco.cx) where you can scale from zero to millions of users without worrying about infrastructure. If you like the framework, give us a try :) life is too short to deal with CDN configuration and database management.

## Creating a new Live.ts site

Want to create a **Live** site from scratch?

Go to https://deco.cx/admin and create a new site. In a few clicks you will have a site deployed to `<mysite>.deco.site` like https://fashion.deco.site, and a GitHub repository you can freely clone, edit and deploy at https://github.com/deco-sites/fashion.

## Adding live to an existing fresh site

Assuming you have a working [fresh](https://fresh.deno.dev) site, you can configure **Live.ts** in 4 quick steps:

### 1. Add Live to your dependencies

First add the `$live` import to your `import_map.json` file:

```json
{
  "imports": {
    "$live/": "https://deno.land/x/live@0/",
    "(...)": "(...)"
  }
}
```

![CleanShot 2022-11-20 at 22 23 51](https://user-images.githubusercontent.com/1633518/202938953-172c6118-86cb-4a0e-8779-ee02ce070157.png)

### 2. Replace the `dev` task from fresh with Live's

Now, let's replace the `dev` import in `dev.ts`. Just change `$fresh/dev.ts` to `$live/dev.ts`:

```ts
import dev from "$live/dev.ts";

await dev(import.meta.url, "./main.ts");
```

![CleanShot 2022-11-20 at 22 22 55](https://user-images.githubusercontent.com/1633518/202938923-066e5faa-f15f-4e6c-b17e-d9f7d670c9fb.png)

### 3. Add the middleware to allow Live to intercept requests and access components

Then create a `routes/_middleware.tsx` file and add the following code:

```tsx
import manifest from "../fresh.gen.ts";
import { withLive } from "$live/live.ts";

export const handler = withLive(manifest, {
  siteId: 8,
});
```

Create a site at `deco.cx/admin` to get a site id you can add here.

![CleanShot 2022-11-20 at 22 24 08](https://user-images.githubusercontent.com/1633518/202938980-5bba5561-4e72-4b39-8cc5-c296668b7015.png)

### 4. Mount the Live.ts handler on a catch-all route

Finally, in order to allow the creation of dynamic pages in any route, mount `live` as a handler for a catch-all route. Create `routes/[...path].tsx`:

```tsx
import { live } from "$live/live.ts";
import LivePage from "$live/components/LivePage.tsx";
export const handler = live();
export default LivePage;
```

![CleanShot 2022-11-20 at 22 24 43](https://user-images.githubusercontent.com/1633518/202939025-a51f0342-6e37-4bf5-86db-b8772e10abe2.png)

Great! **Live.ts** is now setup. You can verify it's working by going to any route that will trigger the catch all. For example, go to https://localhost:8080/start. You should see an empty page with an "Edit in deco.cx" button. Clicking it will redirect you to the deco.cx/live editor, which opens your site in an iframe.

Now, the fun begins! Creating `sections` allow you to create UI components that can be used in any page and can be configured in the admin UI. This allows non-developers to reuse components and compose new pages, experiment on content, etc, all without requiring any code deploy.

### Sections: creating configurable components

Now, let's create a configurable `section`.
**Sections** are ordinary UI components, but they can be configured in the **Live** UI.
They are the building blocks of your site and their configuration can vary dynamically: with experiments, like A/B tests, with scheduled campaigns, or by targeting specific users.

Create the `sections/` folder and a new `sections/Hello.tsx` file with the following code:

```tsx
export interface Props {
  name: string;
}

export default function Hello({ name }: Props) {
  return <div>Hello {name}</div>;
}
```

![CleanShot 2022-11-20 at 22 25 10](https://user-images.githubusercontent.com/1633518/202939072-f384cbd5-675b-47ae-89f9-d7d584ffc32f.png)

Go to https://deco.cx/admin/{yoursite}/library to see a page that mounts the Hello section.

## Live scripts

Live ships some utilitary scripts which you can add to your project as needed.

## Images

One of the most transfered data on the internet are images. Live has first class support for uploading, storing and optimizing images.

### Uploading images

To upload images, you first need a [section component](https://github.com/deco-cx/live#sections-creating-configurable-components) setup. In your section componet import our special Image type and export it as the section prop.

```tsx
// ./sectios/MySection.tsx
import type { Image } from "$live/std/ui/types/Image.ts";

export interface Props {
  src: Image;
  alt: string;
}

export default function MySection({ src, alt }: Props) {
  return <img src={src} alt={alt} />;
}
```

This will create the following image uploader widget on the section editor.
<img width="331" alt="image" src="https://user-images.githubusercontent.com/1753396/203119882-0e3ce76c-d1e7-42a2-aae8-4b384dfc7169.png">

After drag and dropping the target image on this widget, live will upload the image and generate a url. This url will be passed as a prop to your component. Use this prop to render the image in your section

### Optmizing images

Business users may upload huge images (>500Kb) on the image uploader. It's up to the developer to make sure all images are loaded efficiently by making the images responsive, light and correctly encoded. Hopefully, live already ships all of these best practices into an `<Image />` component. To use this image component on the above example:

```tsx
// ./sectios/MySection.tsx
import LiveImage from "$live/std/ui/components/Image.tsx";
import type { Image } from "$live/std/ui/types/Image.ts";

export interface Props {
  src: Image;
  alt: string;
}

export default function MySection({ src, alt }: Props) {
  return <LiveImage src={src} alt={alt} width={500} height={350} />;
}
```

This will create a responsive image that fits most screens and encode it depending on the browser's User Agent, all while distributing the image globally in a CDN!

### HTML to Component script

You can use the `component` script to **transform any HTML in your clipboard**
into a Preact component.

Add the `component` task to your `deno.json` file:

```json
{
  "tasks": {
    "start": "(...)",
    "component": "deno eval 'import \"$live/scripts/component.ts\"'"
  },
  "importMap": "./import_map.json"
}
```

Then copy some HTML into your clipboard. For example:

```html
<div>
  <span>Hello World</span>
  <img src="/test.jpg" >
  <!-- note the unclosed img tag, which is invalid JSX -->
</div>
```

Then run the `component` task passing the ComponentName as first argument:

```bash
deno task component MyTestComponent
```

The new component will be generated in `./components/MyTestComponent.tsx` and
should look like this:

```jsx
export default function MyTestComponent() {
  return (
    <div>
      <span>Hello World</span>
      <img src="/test.jpg" /> {/* note the closed img tag! */}
    </div>
  );
}
```

Aditionally, the import snippet will replace your clipboard content:

```jsx
import MyTestComponent from "../components/MyTestComponent.tsx";
```

## Local development

- `cd examples/counter`
- Create an `.env` file with:

```bash
SUPABASE_KEY=...
SUPABASE_ACCOUNT=...
DECO_SITE=...
```

- `deno task start`

Now browse:

`http://localhost:8080/` for a dynamic page `http://localhost:8080/test` for a
static page

## Distribution

Live is deployed on https://deno.land/x/live using git tags.

To release a new version, go through the following steps:

1. Squash/Merge your Pull Request after approval.
2. Get the next tag you want to release.
3. Run `deno task release` and select the chosen version.

> Please notice that a commit will be automatically in the name of the current user (yours) before generating the tag itself.
