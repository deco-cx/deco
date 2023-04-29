export interface RedirectConfig {
  to: string;
}

export default function Redirect({ to }: RedirectConfig) {
  return () => {
    return Response.redirect(to);
  };
}
