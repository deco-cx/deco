export interface Props {
  pathTemplate: string;
}

export default function pathTemplateAudience(
  { pathTemplate }: Props,
  req: Request,
): boolean {
  const path = new URL(req.url).pathname;
  return pathTemplate === path;
}
