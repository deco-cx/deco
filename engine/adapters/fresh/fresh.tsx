import { PageProps } from "$fresh/server.ts";
import { PreactComponent } from "$live/blocks/types.ts";

export default function Render({
  data: {
    component: { Component, props },
  },
}: PageProps<{ component: PreactComponent }>) {
  return <Component {...props}></Component>;
}
