import type {
  Decofile,
  DecofileProvider,
  OnChangeCallback,
  ReadOptions,
} from "./provider.ts";
import { getProvider } from "./provider.ts";
import { RequestContext } from "../../deco.ts";

/**
 * Pool that manages DecofileProvider instances with automatic cleanup based on timeout.
 * Each provider is cached by its decofilePath and automatically disposed after the specified timeout.
 */
export class ProviderPool {
  private providers = new Map<string, {
    provider: Promise<DecofileProvider>;
    timeoutId: number;
  }>();
  private timeout: number;

  constructor(timeout = 10_000) {
    this.timeout = timeout;
  }

  /**
   * Gets an existing provider or creates a new one for the given decofilePath.
   * Resets the timeout for the provider.
   * @param decofilePath - The path to identify the provider
   * @returns Promise<{provider: DecofileProvider, isNew: boolean}> - The provider instance and whether it's new
   */
  async get(
    decofilePath: string,
  ): Promise<{ provider: DecofileProvider; isNew: boolean }> {
    const existing = this.providers.get(decofilePath);

    // If provider exists, clear the current timeout and reset it
    if (existing) {
      clearTimeout(existing.timeoutId);
      const timeoutId = setTimeout(() => {
        this.disposeProvider(decofilePath);
      }, this.timeout);

      this.providers.set(decofilePath, {
        provider: existing.provider,
        timeoutId,
      });

      return { provider: await existing.provider, isNew: false };
    }

    // Create new provider promise (avoid race condition)
    const providerPromise = getProvider(false, decofilePath, false);

    // Set timeout for automatic disposal
    const timeoutId = setTimeout(() => {
      this.disposeProvider(decofilePath);
    }, this.timeout);

    this.providers.set(decofilePath, {
      provider: providerPromise,
      timeoutId,
    });

    const provider = await providerPromise;
    return { provider, isNew: true };
  }

  /**
   * Disposes a provider and removes it from the pool
   * @param decofilePath - The path of the provider to dispose
   */
  private disposeProvider(decofilePath: string): void {
    const entry = this.providers.get(decofilePath);
    if (entry) {
      clearTimeout(entry.timeoutId);

      // Call dispose if available (async)
      entry.provider.then((provider) => {
        if (provider.dispose) {
          provider.dispose();
        }
      }).catch(() => {
        // Ignore disposal errors
      });

      this.providers.delete(decofilePath);
    }
  }

  /**
   * Disposes all providers and clears the pool
   */
  dispose(): void {
    for (const [decofilePath] of this.providers) {
      this.disposeProvider(decofilePath);
    }
    this.providers.clear();
  }

  /**
   * Gets the number of active providers in the pool
   */
  get size(): number {
    return this.providers.size;
  }

  /**
   * Checks if a provider exists for the given path
   */
  has(decofilePath: string): boolean {
    return this.providers.has(decofilePath);
  }

  /**
   * Gets all active providers (for internal use)
   */
  async getAllProviders(): Promise<DecofileProvider[]> {
    const providerPromises = Array.from(this.providers.values()).map((entry) =>
      entry.provider
    );
    return await Promise.all(providerPromises);
  }
}

/**
 * A DecofileProvider implementation that uses a pool under the hood.
 * Gets the decofile ID from RequestContext.decofile and manages providers automatically.
 * If no decofile is found in context, falls back to a default provider without pooling.
 */
export class PooledDecofileProvider implements DecofileProvider {
  private pool: ProviderPool;
  private fallbackProvider: Promise<DecofileProvider>;
  private callbacks: OnChangeCallback[] = [];
  private fallbackCallbacksRegistered = false;

  constructor(
    fallbackProvider?: DecofileProvider | Promise<DecofileProvider>,
    timeout = 60_000,
  ) {
    this.pool = new ProviderPool(timeout);
    // Create fallback provider for when RequestContext.decofile is undefined
    this.fallbackProvider = fallbackProvider instanceof Promise
      ? fallbackProvider
      : Promise.resolve(fallbackProvider ?? getProvider(false));
  }

  /**
   * Gets the appropriate provider based on RequestContext.decofile
   */
  private async getActiveProvider(): Promise<DecofileProvider> {
    const decofilePath = RequestContext.decofile;

    // If no decofile in context, use fallback provider
    if (decofilePath === undefined) {
      const provider = await this.fallbackProvider;

      // Register callbacks on fallback provider only once
      if (!this.fallbackCallbacksRegistered) {
        this.callbacks.forEach((callback) => provider.onChange(callback));
        this.fallbackCallbacksRegistered = true;
      }

      return provider;
    }

    // Use pooled provider for specific decofile paths
    const { provider, isNew } = await this.pool.get(decofilePath);

    // Only register callbacks on new providers
    if (isNew) {
      this.callbacks.forEach((callback) => provider.onChange(callback));
    }

    return provider;
  }

  async state(options?: ReadOptions): Promise<Decofile> {
    const provider = await this.getActiveProvider();
    return provider.state(options);
  }

  async revision(): Promise<string> {
    const provider = await this.getActiveProvider();
    return provider.revision();
  }

  onChange(callback: OnChangeCallback): void {
    // Store callback for future providers
    this.callbacks.push(callback);

    // Register on fallback provider if callbacks haven't been registered yet
    if (!this.fallbackCallbacksRegistered) {
      this.fallbackProvider.then((provider) => provider.onChange(callback));
    }

    // Register on all existing pooled providers
    this.pool.getAllProviders().then((providers) => {
      providers.forEach((provider) => provider.onChange(callback));
    }).catch(() => {
      // Ignore errors when registering callbacks
    });
  }

  async notify(): Promise<void> {
    const provider = await this.getActiveProvider();
    return provider.notify?.() ?? Promise.resolve();
  }

  async set(state: Decofile, revision?: string): Promise<void> {
    const provider = await this.getActiveProvider();
    return provider.set?.(state, revision) ?? Promise.resolve();
  }

  dispose(): void {
    this.pool.dispose();
    this.fallbackProvider.then((provider) => provider.dispose?.());
  }
}
