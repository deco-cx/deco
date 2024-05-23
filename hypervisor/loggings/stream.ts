import { mergeReadableStreams } from "std/streams/merge_readable_streams.ts";

export interface LogLine {
    text: string;
    timestamp: number;
    level: "info" | "error";
}

export function streamLogsFrom(process: Deno.ChildProcess): AsyncIterableIterator<LogLine> {
    const stdoutStream = process.stdout.pipeThrough(new TextDecoderStream()).pipeThrough(
        new TransformStream<string, LogLine>({
            transform(chunk, controller) {
                controller.enqueue({ text: chunk, timestamp: Date.now(), level: "info" });
            },
        })
    );

    const stderrStream = process.stderr.pipeThrough(new TextDecoderStream()).pipeThrough(
        new TransformStream<string, LogLine>({
            transform(chunk, controller) {
                controller.enqueue({ text: chunk, timestamp: Date.now(), level: "error" });
            },
        })
    );

    const combinedStream = mergeReadableStreams(stdoutStream, stderrStream);
    const reader = combinedStream.getReader();

    const end = Promise.withResolvers<void>();

    return (async function* () {
        process.status.finally(() => {
            end.resolve();
        });

        try {
            while (true) {
                const resp = await Promise.race([reader.read(), end.promise]);
                if (typeof resp !== "object") {
                    return;
                }

                const { value, done } = resp as ReadableStreamReadResult<LogLine>;
                if (done) break;

                yield value;
            }
        } catch (error) {
            console.error("Error reading from stream:", error);
        } finally {
            reader.releaseLock();
        }
    })();
}
