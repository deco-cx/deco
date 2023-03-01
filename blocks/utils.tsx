export interface Props {
  body: string;
}

export default function JsonViewer(p: Props) {
  return <div>{p.body}</div>;
}
