/**
 * Escape hatch to allow throwing an http error
 */
export class HttpError extends Error {
  constructor(public resp: Response) {
    super(`http error ${resp.status}`);
  }
}
