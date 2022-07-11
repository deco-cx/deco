/** @jsx h */
import { h } from "preact";
import { Handlers, PageProps } from "$fresh/server.ts";
import Counter, { defaultProps as counterProps } from "../islands/Counter.tsx";
import Head from "../components/Head.tsx";
import { DecoState } from "$live/types.ts";

export const handler: Handlers<any, DecoState> = {
  GET(_, ctx) {
    return ctx.render({ manifest: ctx.state.manifest });
  },
};

// This is a simple sanity check page that renders an island.
export default function TestRoute({ url, data: { manifest } }: PageProps<any>) {
  return (
    <div class="max-w-2xl">
      <Head
        title={"Render Island Test"}
        description={"Render description"}
        url={url}
        imageUrl="https://dummyimage.com/640x320/cccccc/000000.png"
        faviconUrl=""
        styleUrls={[]}
        themeColor="#aaffaa"
      />
      <h1>Test Route</h1>
      <p>{url.pathname}</p>
      <Counter {...counterProps}></Counter>
      <p>
        Manifest: <pre>{JSON.stringify(manifest, null, 2)}</pre>
      </p>
    </div>
  );
}
