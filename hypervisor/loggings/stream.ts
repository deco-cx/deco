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

    return (async function* () {
        try {
            while (true) {
                const { done, value } = await reader.read();
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