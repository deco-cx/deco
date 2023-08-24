// TODO: soon
// export const kvCacheStorage = async (): Promise<CacheStorage> => {
//   const kv = await Deno.openKv();

//   return {
//     delete: (cacheName: string): Promise<boolean> => {
//       throw new Error("Not Implemented");
//     },
//     has: (cacheName: string): Promise<boolean> => {
//       throw new Error("Not Implemented");
//     },
//     keys: async (): Promise<string[]> => {
//       throw new Error("Not Implemented");
//     },
//     open: async (cacheName: string): Promise<Cache> => {
//       return {
//         add: (request: RequestInfo | URL): Promise<void> => {
//           throw new Error("Not Implemented");
//         },
//         addAll: (requests: RequestInfo[]): Promise<void> => {
//           throw new Error("Not Implemented");
//         },
//         delete: (
//           request: RequestInfo | URL,
//           options?: CacheQueryOptions,
//         ): Promise<boolean> => {
//           throw new Error("Not Implemented");
//         },
//         keys: (
//           request?: RequestInfo | URL,
//           options?: CacheQueryOptions,
//         ): Promise<ReadonlyArray<Request>> => {
//           throw new Error("Not Implemented");
//         },
//         /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/Cache/match) */
//         match: (
//           request: RequestInfo | URL,
//           options?: CacheQueryOptions,
//         ): Promise<Response | undefined> => {
//           throw new Error("Not Implemented");
//         },
//         matchAll: (
//           request?: RequestInfo | URL,
//           options?: CacheQueryOptions,
//         ): Promise<ReadonlyArray<Response>> => {
//           throw new Error("Not Implemented");
//         },

//         put: (
//           request: RequestInfo | URL,
//           response: Response,
//         ): Promise<void> => {
//           throw new Error("Not Implemented");
//         },
//       };
//     },
//     match: (
//       request: URL | RequestInfo,
//       options?: MultiCacheQueryOptions | undefined,
//     ): Promise<Response | undefined> => {
//       throw new Error("Not Implemented");
//     },
//   };
// };

export const getCacheStorage = async (): Promise<CacheStorage> => {
  if (typeof caches !== "undefined") {
    return caches;
  }

  // if (typeof Deno.openKv !== "undefined") {
  //   return kvCacheStorage();
  // }

  throw new Error("Not Implemented");
};
