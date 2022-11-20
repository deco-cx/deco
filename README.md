# deco live — the edge-native DXP

**Live** is the **edge-native digital experience platform** for [fresh](https://fresh.deno.dev) apps.

**Live** allows developers to create `sections` (UI components) and `functions` (data fetchers) that can be **configured in a visual editor UI by anyone in the digital experience team.** This means business users can now **create and evolve** the content and configuration of their digital experience without the need for developers to deploy changes. Developers can add edit functions to existing routes, and business users can create completely dynamic pages composed from these building blocks via UI.

Besides pages, **Live** also lets teams manage **flags, experiments and campaigns** with an instant, global configuration management service optimized for the edge. Using `matcher` and `effect` functions, configuration changes can be applied to any specific audience. Every change is instantly available to matched users, from gradual rollout of features, to A/B testing content, to targeting specific users with personalized content.

**Live** is designed to be **fast, secure and easy to use**. That's why we built it on top of extraordinary open-source technologies, including [fresh](https://fresh.deno.dev), a framework for building edge-native applications, [supabase](https://supabase.io), a managed Postgres DB and auth wrapper, and [jitsu](https://jitsu.io), a data collector. And **Live** is also **open source** and **free**, so you have **zero vendor lock-in**.

We, the creators of **Live**, offer a managed **Live** infrastructure at [deco.cx](https://deco.cx) where you can scale from zero to millions of users without worrying about infrastructure. If you like the framework, give us a try :) life is too short to deal with CDN configuration and database management.

## Creating a new Live site

Want to create a **Live** site from scratch?

- First, fork and clone the [deco start template repo](https://github.com/deco-sites/start).
- Then, in the project directory, run `deno task start`.
- Finally, go to https://localhost:8080 and follow the instructions in the home page.
- From there, you can sign up at `deco.cx` to use the online editor and deploy your site to the edge.

## Adding live to an existing fresh site

Assuming you have a working [fresh](https://fresh.deno.dev) site, you can configure **Live** in 4 quick steps:

### 1. Add Live to your dependencies

First add the `$live` import to your `import_map.json` file:

```json
{
  "imports": {
    "$live/": "https://deno.land/x/live@0.2.0/",
    "(...)": "(...)"
  }
}
```

### 2. Replace the `dev` task from fresh with Live's

Now, let's replace the `dev` import in `dev.ts`. Just change `$fresh/dev.ts` to `$live/dev.ts`:

```ts
import { dev } from "$live/dev.ts";

await dev(import.meta.url, "./main.ts");
```

### 3. Add the middleware to allow Live to intercept requests and access components

Then create a `routes/_middleware.tsx` file and add the following code:

```tsx
import manifest from "../deco.gen.ts";
import { withLive } from "$live/live.ts";

export const handler = withLive(manifest, {
  site: "start",
  siteId: 8,
  domains: ["mysitename.com"],
});
```

### 4. Mount the Live handler on a catch-all route

Finally, in order to allow the creation of dynamic pages in any route, mount `live` as a handler for a catch-all route. Create `routes/[...path].tsx`:

```tsx
import { live, LivePage } from "$live/mod.ts";
export const handler = live();
export default LivePage;
```

Great! **Live** is now setup. You can verify it's working by going to any route that will trigger the catch all. For example, go to https://localhost:8080/start. You should see an empty page with an "Edit in deco.cx" button. Clicking it will redirect you to the deco.cx/live editor, which opens your site in an iframe.

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

Now, when you go to any page, you should see the `Hello` section available in the `Add Component` drawer.
Add it to a page. You should see a `name` field in the section's configuration editor.
When you save this configuration, you'll have a draft version of the page with the `Hello` section.

## Functions: creating configurable data fetchers

Now, let's create a configurable `function`.

// TODO

## Live scripts

Live ships some utilitary scripts which you can add to your project as needed.

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
  <img src="/test.jpg"> 
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

### Copy Partytown files script

The partytown library needs the web and service workers' static files to work.
This script copies these required files. More info:
<https://partytown.builder.io/copy-library-files> Add the `copyPartytown` task to
your `deno.json` file:

```json
{
  "tasks": {
    // ...
    "copyPartytown": "deno eval 'import \"$live/scripts/copyPartytownFiles.ts\"'"
  },
  "importMap": "./import_map.json"
}
```

Then run the `copyPartytown` task with the first argument destination folder to
copy partytown files

```bash
deno task copyPartytown "./static/~partytown/"
```

Pass the `--debug` flag to also copy Partytown's debug files.

```bash
deno task copyPartytown "./static/~partytown/" -- "--debug"
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
