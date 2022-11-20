# deco live — the edge-native DXP

Live is the **edge-native digital experience platform** for [fresh](https://fresh.deno.dev) apps.

Live allows developers to create `sections` (UI components) and `functions` (data fetchers) that can be **configured in a visual editor UI by everyone in a digital experience team.** This means business users can now **create and evolve** the content and configuration of their digital experience without the need for developers to deploy changes. Developers can add edit functions to existing routes, and business users can create completely dynamic pages composed from these building blocks via UI.

Besides pages, live also lets teams manage **flags, experiments and campaigns** with an instant, global configuration management service optimized for the edge. Using `matcher` and `effect` functions, configuration changes can be applied to any specific audience. Every change is instantly available to matched users, from gradual rollout of features, to A/B testing content, to targeting specific users with personalized content.

Live is designed to be **fast, secure and easy to use**. That's why we built it on top of extraordinary open-source libraries, including [fresh](https://fresh.deno.dev), a framework for building edge-native applications, [supabase](https://supabase.io), a managed postgres and auth wrapper, and [jitsu](https://jitsu.io), a data collector. And that's why it is also **open source** and **free**. We, the creators of Live, offer a managed Live infrastructure at [deco.cx](https://deco.cx) where you can scale from zero to millions of users without worrying about infrastructure. If you like the framework, give us a try :)

Want to create a Live Site? Use the
[deco start template repo](https://github.com/deco-sites/start) to create a new
site. Clone it and run `deno task start`. Finally, go to https://localhost:8080 and follow the instructions in the home page.

## Adding live to an existing fresh site

First add the `$live` import to your `import_map.json` file:

```json
{
  "imports": {
    "$live/": "https://deno.land/x/live@0.2.0/",
    "(...)": "(...)"
  }
}
```

Now, replace the `dev` import in `dev.ts` with `$live`:

```ts
import { dev } from "$live/dev.ts";

await dev(import.meta.url, "./main.ts");
```

Then create a `routes/_middleware.tsx` file and add the following code:

```tsx
import { withLive } from "$live/live.tsx";

export const handler = withLive();
```

Great! Now add `export interface Props {}` to any route, like `index.ts`, and use those props in your route component.

When you open this route in the deco.cx/live editor, you will notice that you can edit this route's props. You can also add new routes and edit their props.

### Sections: creating configurable components

Now, let's create a configurable `section`.
**Sections** are ordinary UI components, but they can be configured in the live UI. 
They are the building blocks of your site.

Create the `sections/` folder and a new `sections/Hello.tsx` file with the following code:

```tsx
export interface Props {
  name: string;
}

export default function Hello({ name }: Props) {
  return <div>Hello {name}</div>;
}
```

Finally, in order to allow fully dynamic pages, mount `live` as a handler for a catch-all route. Create `routes/[...path].tsx`:

```tsx
import { live, LivePage } from "$live/live.ts";
export const handler = live();
export default LivePage;
```


Replacing `site` and `domains` for your own values. Haven't created a site yet?
Go to `deco.cx` and create one for free.

**PROTIP:** When you create a site on `deco.cx`, you automatically get a working
repository at `deco-sites/<your-site>`. You can clone it, start coding your
components and deploying right away, with zero setup.

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
