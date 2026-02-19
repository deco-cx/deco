// Lazy-loading wrapper for OpenTelemetry to avoid 3-5s startup penalty
// OpenTelemetry initialization only happens when first accessed

let _initialized = false;
let _tracer: any = null;
let _resource: any = null;

async function initializeOpenTelemetry() {
  if (_initialized) return;
  _initialized = true;

  // Load the actual config module
  const config = await import("./config.ts");
  _tracer = config.tracer;
  _resource = config.resource;
}

// Proxy that initializes on first access
export const tracer = new Proxy({} as any, {
  get(_target, prop) {
    if (!_initialized) {
      // Synchronous fallback - return no-op span that queues initialization
      if (prop === "startSpan" || prop === "startActiveSpan") {
        // Queue initialization but return a no-op span for now
        initializeOpenTelemetry().catch(console.error);
        return () => ({
          end: () => {},
          setAttribute: () => {},
          setStatus: () => {},
          recordException: () => {},
          updateName: () => {},
        });
      }
    }
    return _tracer?.[prop];
  },
});

export const resource = new Proxy({} as any, {
  get(_target, prop) {
    return _resource?.[prop];
  },
});

// Pre-initialize if OTEL is enabled (can be called explicitly)
export async function ensureInitialized() {
  await initializeOpenTelemetry();
}
