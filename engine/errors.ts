/**
 * Escape hatch to allow throwing an http error
 */
export class HttpError extends Error {
  constructor(public resp: Response) {
    super(`http error ${resp.status}`);
  }
}

/**
 * Stop any config resolution and throw an exception that should be returned to the main handler.
 * @param resp
 */
export const shortcircuit = (resp: Response) => {
  throw new HttpError(resp);
};

/**
 * Redirect using the specified @param url.
 */
export const redirect = (url: string | URL, status?: number) => {
  shortcircuit(Response.redirect(url, status));
};

/**
 * Returns not found error.
 */
export const notFound = () => {
  shortcircuit(new Response(null, { status: 404 }));
};
