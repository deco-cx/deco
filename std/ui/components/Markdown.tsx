import { CSS, render } from "https://deno.land/x/gfm@0.1.26/mod.ts";
import { LoaderReturnType } from "$live/std/types.ts";

export type Props = {
  text: LoaderReturnType<string>;
};

export default function Markdown({ text }: Props) {
  const body = render(text);
  return (
    <>
      <style>
        ${CSS}
      </style>
      <div class="markdown-body" dangerouslySetInnerHTML={{ __html: body }} />
    </>
  );
}
