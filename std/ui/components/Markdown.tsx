import { marky } from "https://deno.land/x/marky@v1.1.6/mod.ts";

export type Props = {
  text: string;
};

export default function Markdown({ text }: Props) {
  const body = marky(text);
  return (
    <div class="markdown-body" dangerouslySetInnerHTML={{ __html: body }} />
  );
}
