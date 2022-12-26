import type { HTML } from "$live/std/ui/types/HTML.ts";

export interface Props {
  html: HTML;
}

export default function QuillText(props: Props) {
  return (
    <>
      {/* TODO: figure out a way to dedupe links on render page */}
      <link
        href="https://cdn.quilljs.com/1.3.6/quill.snow.css"
        rel="stylesheet"
      >
      </link>
      <div class="ql-editor" dangerouslySetInnerHTML={{ __html: props.html }}>
      </div>
    </>
  );
}
