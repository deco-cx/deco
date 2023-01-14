export interface Props {
  pathTemplate: string;
}

export default function pathTemplateAudience(
  req: Request,
  { pathTemplate }: Props,
): boolean {
  const path = new URL(req.url).pathname;
  return pathTemplate === path;
}
