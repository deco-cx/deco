/**
 * Client-side Invoke
 * Provides Runtime.invoke for calling loaders/actions from the browser
 */

type InvokeOptions = {
  signal?: AbortSignal;
};

type InvokePayload = Record<string, { key: string; props?: unknown }>;

/**
 * Creates a runtime client that can invoke loaders and actions
 * Usage: const Runtime = withManifest<Manifest>();
 */
export function withManifest<_TManifest = unknown>() {
  return {
    /**
     * Invoke multiple loaders/actions in a single request
     */
    async invoke<T extends InvokePayload>(
      payload: T,
      options?: InvokeOptions,
    ): Promise<{ [K in keyof T]: unknown }> {
      const response = await fetch("/deco/invoke", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: options?.signal,
      });

      if (!response.ok) {
        throw new Error(`Invoke failed: ${response.statusText}`);
      }

      return response.json();
    },

    /**
     * Invoke a single loader/action
     */
    async invokeOne<T = unknown>(
      key: string,
      props?: unknown,
      options?: InvokeOptions,
    ): Promise<T> {
      const result = await this.invoke({ result: { key, props } }, options);
      return result.result as T;
    },
  };
}

// Default runtime instance
export const Runtime = withManifest();

