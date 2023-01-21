export interface Props {
  traffic: number;
}

export default function randomAudience(
  { traffic }: Props,
  _: Request,
): boolean {
  return Math.random() < traffic;
}
