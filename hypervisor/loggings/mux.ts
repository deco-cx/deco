import { Queue } from "https://deno.land/x/async@v2.1.0/queue.ts";

export interface StreamMultiplexer<T> {
    read: () => AsyncIterableIterator<T>;
    lastReceived: () => T | undefined;
}

/**
 * Multiplexes an async iterator into multiple async iterators.
 */
export const multiplexer = <T>(
    original: AsyncIterableIterator<T>,
    lastEvent?: T,
): StreamMultiplexer<T> => {
    const watchers: Record<string, Queue<T>> = {};
    const ctrl = new AbortController();
    (async () => {
        for await (const event of original) {
            for (const q of Object.values(watchers)) {
                q.push(event);
                if (lastEvent) { // lastEvent means that the first event should be raised as soon as the stream starts.
                    lastEvent = event;
                }
            }
        }
        ctrl.abort();
    })();
    return {
        lastReceived: () => {
            return lastEvent;
        },
        read: () => {
            const id = crypto.randomUUID();
            const q = new Queue<T>();
            watchers[id] = q;
            const iterator = async function* () {
                if (lastEvent) {
                    yield lastEvent;
                }
                while (true) {
                    try {
                        yield await q.pop({ signal: ctrl.signal });
                    } catch (err) {
                        if (ctrl.signal.aborted) {
                            return;
                        }
                        throw err;
                    }
                }
            };

            const stream = iterator();
            const retn = stream.return;
            stream.return = async function (val) {
                delete watchers[id];
                const streamRetn = await retn?.call(stream, val) ?? val; // Ensure to call retn within the context of 'stream';
                if (Object.keys(watchers).length === 0) {
                    await original?.return?.();
                }
                return streamRetn; // Ensure to call retn within the context of 'stream'
            };
            return stream;
        },
    };
};
