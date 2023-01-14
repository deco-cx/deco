export interface Props {
  traffic: number;
}

export default function randomAudience(
  _: Request,
  { traffic }: Props,
): boolean {
  return Math.random() < traffic;
}
