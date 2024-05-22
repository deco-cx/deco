/**
 * Escape hatch to allow throwing an http error
 */
export class HttpError extends Error {
  public status: number;
  constructor(public resp: Response) {
    super(`http error ${resp.status}`);
    this.status = resp.status;
  }
}

export interface HttpErrorMessage {
  message: string;
  code?: string;
}

/**
 * Returns a response with given status and formatted error message if provided.
 */
export const status = (status: number) =>
(
  err?: HttpErrorMessage,
  headers?: Headers,
) => {
  const mHeaders = headers ?? new Headers();
  if (err) {
    mHeaders.set("content-type", "application/json");
  }
  shortcircuit(
    new Response(err ? JSON.stringify(err) : null, {
      status,
      headers: mHeaders,
    }),
  );
};

/**
 * Returns a forbidden error.
 */
export const forbidden = status(403);

/**
 * Returns a unauthorized error.
 */
export const unauthorized = status(401);

/**
 * Returns not found error.
 */
export const notFound = status(404);

/**
 * Returns a bad request error
 */
export const badRequest = status(400);

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
  shortcircuit(
    new Response(null, {
      status: status ?? 307,
      headers: { location: url.toString() },
    }),
  );
};
