export interface Props {
  includes?: string;
  match?: string;
}

export default function userAgentAudience(
  { includes, match }: Props,
  req: Request,
): boolean {
  const ua = req.headers.get("user-agent") || "";
  if (match) {
    const regex = new RegExp(match);
    return regex.test(ua);
  }
  if (includes) {
    return ua.includes(includes);
  }
  return false;
}
