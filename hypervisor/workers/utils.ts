export const isListening = async (port: number): Promise<boolean> => {
  try {
    // Try to connect to the port
    const conn = await Deno.connect({ port, transport: "tcp" });
    conn.close();
    return true;
  } catch {
    return false;
  }
};

export async function waitForPort(
  port: number,
  options: { listening?: boolean; timeout?: number; signal?: AbortSignal } = {},
): Promise<void> {
  const { listening = true, timeout = 10000 } = options;
  const startTime = Date.now();
  while (true) {
    if (listening === await isListening(port)) {
      return;
    }
    // Check if timeout is reached
    if (Date.now() - startTime >= timeout || options?.signal?.aborted) {
      throw new Error(
        `Timeout waiting for port ${port} to ${
          listening ? "be ready" : "be unavailable"
        }`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
