import { createHandler } from "../middleware.ts";

export const handler = createHandler(async (
  { var: state, req },
) => {
  const isUpToDate = Promise.withResolvers<void>();
  const timestampParam = req.query("timestamp");
  const tsFile = req.query("tsFile");

  if (!timestampParam || !tsFile) {
    return new Response(
      JSON.stringify({ error: "Missing timestamp or tsFile parameter" }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }

  const targetTimestamp = parseInt(timestampParam);
  const pollInterval = 2000; // Poll every 2 seconds
  const timeout = 5 * 60 * 1000; // 5 minutes
  const startTime = Date.now();
  let resolved = false;

  using _ = state.release.onChange(() => {
    isUpToDate.resolve();
    resolved = true;
  });

  const checkTimestamp = async () => {
    if (resolved) {
      return;
    }

    const elapsed = Date.now() - startTime;

    // Check timeout
    if (elapsed >= timeout) {
      isUpToDate.resolve();
      return;
    }

    try {
      // Read the timestamp file
      const fileContent = await Deno.readTextFile(tsFile);
      const fileTimestamp = parseInt(fileContent.trim());

      // Check if timestamp is >= target
      if (fileTimestamp >= targetTimestamp) {
        await state.release.notify?.();
        // Check again after notify to see if callbacks fired
        if (!resolved) {
          // Schedule next check if still not resolved
          setTimeout(checkTimestamp, pollInterval);
        }
      } else {
        // Not ready yet, schedule next check
        setTimeout(checkTimestamp, pollInterval);
      }
    } catch (_error) {
      // File might not exist yet or be unreadable, keep polling
      setTimeout(checkTimestamp, pollInterval);
    }
  };

  // Start polling
  checkTimestamp();

  await isUpToDate.promise;
  const elapsed = Date.now() - startTime;

  return new Response(
    JSON.stringify({ elapsed }),
    {
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
});
