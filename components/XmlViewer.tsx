/** @jsxRuntime automatic */
/** @jsxImportSource preact */

export interface Props {
  body: string;
}

export default function XmlViewer(p: Props) {
  return (
    <>
      <pre>{p.body}</pre>
    </>
  );
}
