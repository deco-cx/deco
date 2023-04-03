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
        <link
          id="viewer"
          href="https://cdnjs.cloudflare.com/ajax/libs/jquery-jsonview/1.2.3/jquery.jsonview.min.css"
          type="text/css"
          rel="stylesheet"
        />
        <script
          dangerouslySetInnerHTML={{
            __html:
              `document.querySelector('#viewer').onload = () => {
                jQuery('#json-renderer').JSONView(${p.body})
              }`,
          }}
        >
        </script>
      </Head>
      <pre id="json-renderer"></pre>
    </>
  );
}
