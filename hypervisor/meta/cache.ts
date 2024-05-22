let lastMetaResponse: null | Response = null;
export interface CacheStaleMetaCallbacks {
  then: (resp: Response) => Response;
  catch: (err: unknown) => Response;
}
export const cacheStaleMeta = (reqUrl: URL): CacheStaleMetaCallbacks => {
  const isMeta = reqUrl.pathname.endsWith("/live/_meta") ||
    reqUrl.pathname.endsWith("/deco/meta");
  if (
    !isMeta || (isMeta && reqUrl.searchParams.get("waitForChanges") === "true")
  ) {
    return {
      then: (resp: Response) => resp,
      catch: (err: unknown) => {
        throw err;
      },
    };
  }

  return {
    then: (resp: Response) => {
      if (resp.status === 204 || resp.status === 304) {
        return resp;
      }
      if (resp.status !== 200) {
        if (lastMetaResponse) {
          return lastMetaResponse.clone();
        }
        return resp;
      }
      lastMetaResponse = resp.clone();
      return resp;
    },
    catch: (err) => {
      if (lastMetaResponse) {
        return lastMetaResponse.clone();
      }
      throw err;
    },
  };
};
