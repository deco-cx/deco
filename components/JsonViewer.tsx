import { Head } from "$fresh/runtime.ts";

export interface Props {
  body: string;
}

export default function JsonViewer(p: Props) {
  return (
    <>
      <Head>
        <script src="https://code.jquery.com/jquery-3.6.4.min.js">
        </script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/jquery-jsonview/1.2.3/jquery.jsonview.min.js">
        </script>
        <script
          dangerouslySetInnerHTML={{
            __html: `
            const viewerTag = document.createElement('link');
            viewerTag.id = "viewer";
            viewerTag.href = "https://cdnjs.cloudflare.com/ajax/libs/jquery-jsonview/1.2.3/jquery.jsonview.min.css";
            viewerTag.type = "text/css";
            viewerTag.rel = "stylesheet";

            viewerTag.onload = () => {
              jQuery('#json-renderer').JSONView(${p.body})
            }
            document.head.append(viewerTag);`,
          }}
        >
        </script>
      </Head>
      <pre id="json-renderer"></pre>
    </>
  );
}
