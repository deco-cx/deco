export interface RedirectConfig {
  to: string;
  type?: "permanent" | "temporary";
}

export default function Redirect({ to, type = "temporary" }: RedirectConfig) {
  /** https://archive.is/kWvxu */
  const statusByRedirectType: Record<
    NonNullable<RedirectConfig["type"]>,
    number
  > = {
    "temporary": 307,
    "permanent": 301,
  };

  return () => {
    return new Response(null, {
      status: statusByRedirectType[type],
      headers: {
        location: to,
      },
    });
  };
}
