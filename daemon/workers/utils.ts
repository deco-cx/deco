export const isListening = async (port: number): Promise<boolean> => {
  try {
    // Try to connect to the port
    const conn = await Deno.connect({ port, transport: "tcp" });
    conn.close();
    return true;
  } catch (err) {
    console.log(`[isListening] Error connecting to port ${port}:`, err);
    return false;
  }
};

export async function waitForPort(
  port: number,
  options: { listening?: boolean; timeout?: number; signal?: AbortSignal } = {},
): Promise<void> {
  const { listening = true, timeout = 10_000 } = options;
  const startTime = Date.now();
  console.log(
    `[waitForPort] start port=${port} listening=${listening} timeout=${timeout}ms aborted=${
      options?.signal?.aborted ?? false
    }`,
  );
  while (true) {
    if (listening === await isListening(port)) {
      console.log(
        `[waitForPort] success port=${port} listening=${listening} after=${
          Date.now() - startTime
        }ms`,
      );
      return;
    }
    // Check if timeout is reached
    if ((Date.now() - startTime >= timeout) || options?.signal?.aborted) {
      console.log(
        `[waitForPort] fail port=${port} listening=${listening} after=${
          Date.now() - startTime
        }ms aborted=${options?.signal?.aborted ?? false}`,
      );
      throw new Error(
        `Timeout waiting for port ${port} to ${
          listening ? "be ready" : "be unavailable"
        }`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
