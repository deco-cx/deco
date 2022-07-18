# deco live — the edge-native CMS

Live is the edge-native CMS based on fresh.
It lets your business users live edit any fresh site.

## Start using

Add the `$live` import to your `import_mat.json` file:

```json
{
  "imports": {
    "$live/": "https://deno.land/x/live@0.0.6/",
  }
}
```

## Live scripts

Live ships some utilitary scripts which you can add to your as needed.

### HTML to Component script

You can use the `component` script to **transform any HTML in your clipboard** into a Preact component.

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

Then copy some HTML into your clipbord. For example:

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

The new component will be generated in `./components/MyTestComponent.tsx` and should look like this:

```jsx
/** @jsx h */
/** @jsxFrag Fragment */
import { Fragment, h } from "preact";

export default function MyTestComponent() {
  return (
    <div>
      <span>Hello World</span>
      <img src="/test.jpg" />{" "}
      {/* note the closed img tag! */}
    </div>
  );
}
```

Aditionally, the import snippet will replace your clipboard content:

```jsx
import MyTestComponent from '../components/MyTestComponent.tsx';
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

`http://localhost:8080/` for a dynamic page
`http://localhost:8080/test` for a static page
