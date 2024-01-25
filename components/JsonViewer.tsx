import { Head } from "../deps.ts";

export interface Props {
  body: string;
}

const snippet = (json: string) => {
  const node = ([
    ["script", { src: "https://code.jquery.com/jquery-3.6.4.min.js" }],
    ["script", {
      src:
        "https://cdnjs.cloudflare.com/ajax/libs/jquery-jsonview/1.2.3/jquery.jsonview.min.js",
    }],
    ["link", {
      href:
        "https://cdnjs.cloudflare.com/ajax/libs/jquery-jsonview/1.2.3/jquery.jsonview.min.css",
      type: "text/css",
      rel: "stylesheet",
    }],
  ] as const).reduce((node: HTMLElement | null, [element, attributes]) => {
    const n = document.createElement(element);
    Object.entries(attributes).forEach(([key, value]) =>
      n.setAttribute(key, value)
    );

    if (node) {
      node.addEventListener("load", () => document.head.appendChild(n));
    } else {
      // first element of reduce
      document.head.appendChild(n);
    }

    return n;
  }, null);

  node?.addEventListener(
    "load",
    () => (globalThis.window as any).jQuery("#json-renderer").JSONView(json),
  );
};

export default function JsonViewer(p: Props) {
  return (
    <>
      <Head>
        <script
          type="module"
          dangerouslySetInnerHTML={{ __html: `(${snippet})(${p.body});` }}
        />
      </Head>
      <pre id="json-renderer">{p.body}</pre>
    </>
  );
}
