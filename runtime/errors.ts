/**
 * Escape hatch to allow throwing a http error
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

export type ResponseErrorBuilder = (
  err?: HttpErrorMessage,
  headers?: Headers,
) => void;
/**
 * Returns a response with given status and formatted error message if provided.
 */
export const status = (status: number): ResponseErrorBuilder =>
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
export const forbidden: ResponseErrorBuilder = status(403);

/**
 * Returns a unauthorized error.
 */
export const unauthorized: ResponseErrorBuilder = status(401);

/**
 * Returns not found error.
 */
export const notFound: ResponseErrorBuilder = status(404);

/**
 * Returns a bad request error
 */
export const badRequest: ResponseErrorBuilder = status(400);

/**
 * Stop any config resolution and throw an exception that should be returned to the main handler.
 * @param resp
 */
export const shortcircuit = (resp: Response): never => {
  throw new HttpError(resp);
};

/**
 * Redirect using the specified @param url.
 */
export const redirect = (url: string | URL, status?: number): void => {
  shortcircuit(
    new Response(null, {
      status: status ?? 307,
      headers: { location: url.toString() },
    }),
  );
};
