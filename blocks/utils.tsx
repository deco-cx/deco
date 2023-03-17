function syntaxHighlight(json: string) {
  json = json.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(
    />/g,
    "&gt;",
  );
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    function (match) {
      let cls = "number";
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = "key";
        } else {
          cls = "string";
        }
      } else if (/true|false/.test(match)) {
        cls = "boolean";
      } else if (/null/.test(match)) {
        cls = "null";
      }
      return '<span class="' + cls + '">' + match + "</span>";
    },
  );
}

export interface Props {
  body: string;
}

export default function JsonViewer(p: Props) {
  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `pre {outline: 1px solid #ccc; padding: 5px; margin: 5px; }
.string { color: green; }
.number { color: darkorange; }
.boolean { color: blue; }
.null { color: magenta; }
.key { color: red; }
`,
        }}
      >
      </style>
      <script
        dangerouslySetInnerHTML={{
          __html:
            `const myfunc = ${syntaxHighlight.toString()}; document.body.appendChild(document.createElement('pre')).innerHTML = myfunc(JSON.stringify(${p.body}, null, 4))`,
        }}
      >
      </script>
    </>
  );
}
