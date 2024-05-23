import {
    mergeReadableStreams,
} from "std/streams/merge_readable_streams.ts";

export interface LogLine {
    text: string;
    timestamp: number;
}
// Function to stream logs from the process
export function streamLogsFrom(process: Deno.ChildProcess): AsyncIterableIterator<LogLine> {
    const combinedStream = mergeReadableStreams(
        process.stdout.pipeThrough(new TextDecoderStream()),
        process.stderr.pipeThrough(new TextDecoderStream())
    );

    const reader = combinedStream.getReader();

    const end = Promise.withResolvers<void>();
    return (async function* () {
        process.status.finally(() => {
            end.resolve();
        })
        try {
            while (true) {
                const resp = await Promise.race([reader.read(), end.promise]);
                if (typeof resp !== "object") {
                    return;
                }
                const { value, done } = resp as ReadableStreamReadResult<string>;
                if (done) break;
                yield { text: value, timestamp: Date.now() };
            }
        } catch (error) {
            console.error("Error reading from stream:", error);
        } finally {
            reader.releaseLock();
        }
    })();
}