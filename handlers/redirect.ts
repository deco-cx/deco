export interface RedirectConfig {
  to: string;
}

export default function Redirect({ to }: RedirectConfig) {
  return () => {
    return new Response(null, {
      status: 307,
      headers: {
        location: to,
      },
    });
  };
}
