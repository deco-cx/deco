const ALLOWED_AUTHORITIES_ENV_VAR_NAME = "DECO_ALLOWED_AUTHORITIES";
const ALLOWED_AUTHORITIES = Deno.env.has(ALLOWED_AUTHORITIES_ENV_VAR_NAME)
  ? Deno.env.get(ALLOWED_AUTHORITIES_ENV_VAR_NAME)!.split(",")
  : ["configs.decocdn.com", "configs.deco.cx", "admin.deco.cx", "localhost"];

export const assertAllowedAuthority = (urlOrString: string | URL) => {
  const url = urlOrString instanceof URL ? urlOrString : new URL(urlOrString);
  if (!ALLOWED_AUTHORITIES.includes(url.hostname)) {
    throw new Error(
      `authority ${url.hostname} is not allowed to be fetched from`,
    );
  }
};
