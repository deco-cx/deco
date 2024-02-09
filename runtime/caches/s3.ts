import { logger, tracer } from "../../observability/otel/config.ts";
import {
    assertCanBeCached,
    assertNoOptions,
    withCacheNamespace,
} from "./common.ts";
import {
    DeleteObjectCommand,
    GetObjectCommand,
    PutObjectCommand,
    S3Client,
} from "https://esm.sh/@aws-sdk/client-s3";

const bucketName = Deno.env.get("UPLOAD_BUCKET")!;
const awsRegion = Deno.env.get("AWS_REGION")!;
const awsAccessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID")!;
const awsSecretAccessKey = Deno.env.get("AWS_SECRET_ACCESS_KEY")!;

const s3Client = new S3Client({
    region: awsRegion,
    credentials: {
        accessKeyId: awsAccessKeyId,
        secretAccessKey: awsSecretAccessKey,
    },
});

interface ResponseMetadata {
    body: string;
    status: number;
    headers: [string, string][];
}

async function putObject(
    key: string,
    responseObject: string,
    expiresIn: number,
) {
    const bucketParams = {
        Bucket: bucketName,
        Key: key,
        Body: JSON.stringify(responseObject),
        Expires: new Date(expiresIn),
    };

    const command = new PutObjectCommand(bucketParams);
    const response = await s3Client.send(command);
    console.log(
        "putobject response status code: ",
        response.$metadata.httpStatusCode,
    );
    return response;
}

async function getObject(key: string) {
    const bucketParams = {
        Bucket: bucketName,
        Key: key,
    };

    const command = new GetObjectCommand(bucketParams);

    const response = await s3Client.send(command);
    console.log(
        "getObject response status code: ",
        response.$metadata.httpStatusCode,
    );
    return response;
}

async function deleteObject(key: string) {
    const bucketParams = {
        Bucket: bucketName,
        Key: key,
    };

    const command = new DeleteObjectCommand(bucketParams);

    const response = await s3Client.send(command);
    console.log(
        "deleteObject response status code: ",
        response.$metadata.httpStatusCode,
    );
    return response;
}

function base64encode(str: string): string {
    return btoa(encodeURIComponent(str));
}

function base64decode(str: string): string {
    return decodeURIComponent(atob(str));
}
export const caches: CacheStorage = {
    delete: (_cacheName: string): Promise<boolean> => {
        throw new Error("Not Implemented");
    },
    has: (_cacheName: string): Promise<boolean> => {
        throw new Error("Not Implemented");
    },
    keys: (): Promise<string[]> => {
        throw new Error("Not Implemented");
    },
    match: (
        _request: URL | RequestInfo,
        _options?: MultiCacheQueryOptions | undefined,
    ): Promise<Response | undefined> => {
        throw new Error("Not Implemented");
    },
    open: (cacheName: string): Promise<Cache> => {
        const requestURLSHA1 = withCacheNamespace(cacheName);
        return Promise.resolve({
            /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/Cache/add) */
            add: (_request: RequestInfo | URL): Promise<void> => {
                throw new Error("Not Implemented");
            },
            /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/Cache/addAll) */
            addAll: (_requests: RequestInfo[]): Promise<void> => {
                throw new Error("Not Implemented");
            },
            /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/Cache/delete) */
            delete: async (
                request: RequestInfo | URL,
                options?: CacheQueryOptions,
            ): Promise<boolean> => {
                assertNoOptions(options);

                const deleteResponse = await deleteObject(
                    await requestURLSHA1(request),
                );
                // TODO(@ItamarRocha): check why need the > 0
                if (deleteResponse.$metadata.httpStatusCode === undefined) {
                    return false;
                }
                return deleteResponse.$metadata.httpStatusCode == 204;
            },
            /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/Cache/keys) */
            keys: (
                _request?: RequestInfo | URL,
                _options?: CacheQueryOptions,
            ): Promise<ReadonlyArray<Request>> => {
                throw new Error("Not Implemented");
            },
            /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/Cache/match) */
            match: async (
                request: RequestInfo | URL,
                options?: CacheQueryOptions,
            ): Promise<Response | undefined> => {
                assertNoOptions(options);
                const cacheKey = await requestURLSHA1(request);
                const span = tracer.startSpan("s3-get", {
                    attributes: {
                        cacheKey,
                    },
                });
                try {
                    const getResponse = await getObject(cacheKey);
                    if (getResponse.Body === undefined) {
                        logger.error(`error when reading from s3, ${getResponse}`);
                        return undefined;
                    }
                    const data = JSON.parse(await getResponse.Body.transformToString());
                    if (data === null) {
                        span.addEvent("cache-miss");
                        return undefined;
                    }
                    span.addEvent("cache-hit");
                    if (data instanceof Error) {
                        logger.error(
                            `error when reading from s3, ${data.toString()}`,
                        );
                        return undefined;
                    }

                    const parsedData: ResponseMetadata = typeof data === "string"
                        ? JSON.parse(data)
                        : data;
                    return new Response(base64decode(parsedData.body), {
                        status: parsedData.status,
                        headers: new Headers(parsedData.headers),
                    });
                } catch (err) {
                    span.recordException(err);
                    throw err;
                } finally {
                    span.end();
                }
            },
            /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/Cache/matchAll) */
            matchAll: (
                _request?: RequestInfo | URL,
                _options?: CacheQueryOptions,
            ): Promise<ReadonlyArray<Response>> => {
                throw new Error("Not Implemented");
            },
            /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/Cache/put) */
            put: async (
                request: RequestInfo | URL,
                response: Response,
            ): Promise<void> => {
                const req = new Request(request);
                assertCanBeCached(req, response);

                if (!response.body) {
                    return;
                }

                const cacheKey = await requestURLSHA1(request);
                const span = tracer.startSpan("s3-put", {
                    attributes: {
                        cacheKey,
                    },
                });

                try {
                    let expires = response.headers.get("expires");
                    if (!expires && (response.status >= 300 || response.status < 200)) { //cannot be cached
                        span.addEvent("cannot-be-cached", {
                            status: response.status,
                            expires: expires ?? "undefined",
                        });
                        return;
                    }
                    expires ??= new Date(Date.now() + (180_000)).toUTCString();

                    const expDate = new Date(expires);
                    const timeMs = expDate.getTime() - Date.now();
                    if (timeMs <= 0) {
                        span.addEvent("negative-time-ms", { timeMs: `${timeMs}` });
                        return;
                    }

                    response.text().then(base64encode).then((body) => {
                        const newMeta: ResponseMetadata = {
                            body,
                            status: response.status,
                            headers: [...response.headers.entries()],
                        };

                        const expiresIn = timeMs;
                        const setSpan = tracer.startSpan("s3-set", {
                            attributes: { cacheKey },
                        });
                        // TODO (@ItamarRocha): change this catch, doesnt suits
                        putObject(cacheKey, JSON.stringify(newMeta), expiresIn).catch(
                            (err) => {
                                console.error("s3 error", err);
                                setSpan.recordException(err);
                            },
                        ).finally(() => {
                            setSpan.end();
                        }); // do not await for setting cache
                    }).catch((err) => {
                        logger.error(`error saving to s3 ${err?.message}`);
                    });
                } catch (err) {
                    span.recordException(err);
                    throw err;
                } finally {
                    span.end();
                }
            },
        });
    },
};
