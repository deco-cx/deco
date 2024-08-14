export interface LogLine {
  message: string;
  timestamp: number;
  level: "info" | "error";
}
export interface StdStreamable {
  stdout: ReadableStream<Uint8Array>;
  stderr: ReadableStream<Uint8Array>;
  status: Promise<unknown>;
}

const decoder = new TextDecoder();

export async function* iteratorFrom(
  stream: ReadableStream<Uint8Array>,
  level: "info" | "error",
) {
  const reader = stream.getReader();

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      yield {
        message: decoder.decode(value),
        timestamp: Date.now(),
        level,
      };
    }
  } finally {
    reader.releaseLock();
  }
}

export function streamLogsFrom(
  process: StdStreamable,
): AsyncIterableIterator<LogLine>[] {
  const stdout = iteratorFrom(process.stdout, "info");
  const stderr = iteratorFrom(process.stderr, "error");

  return [stdout, stderr];
}

function createLogsInterface() {
  const MAX_LENGTH = 10_000;
  const MAX_COUNT = 1000;
  const target = new EventTarget();
  const buffer: LogLine[] = [];

  // deno-lint-ignore no-explicit-any
  target.addEventListener("log", (e: any) => {
    const line: LogLine = e.detail;

    if (line.level === "error") {
      console.error(line.message?.replace(/\n$/, ""));
    } else {
      console.log(line.message?.replace(/\n$/, ""));
    }

    buffer.push(line);
    if (buffer.length > MAX_COUNT) {
      buffer.shift();
    }
  });

  const listen = () =>
    new Promise<LogLine>((resolve) =>
      // deno-lint-ignore no-explicit-any
      target.addEventListener("log", (e: any) => resolve(e.detail), {
        once: true,
      })
    );

  async function* read() {
    for (const line of buffer) {
      yield line;
    }

    while (true) {
      yield await listen();
    }
  }

  const push = (
    { message = "unknown", level = "info", timestamp = Date.now() }: Partial<
      LogLine
    >,
  ) => {
    target.dispatchEvent(
      new CustomEvent("log", {
        detail: {
          level,
          timestamp,
          message: message.length > MAX_LENGTH
            ? `${message.slice(0, MAX_LENGTH)}...`
            : message,
        },
      }),
    );
  };

  return {
    register: async (it: AsyncIterableIterator<LogLine>) => {
      for await (const line of it) {
        push(line);
      }
    },
    push,
    read,
  };
}

export const logs = createLogsInterface();
