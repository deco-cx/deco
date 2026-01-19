// O11y (observability) compat shim
export const logger = { info: console.log, warn: console.warn, error: console.error, debug: console.debug };
export const meter = { createCounter: () => ({ add: () => {} }), createHistogram: () => ({ record: () => {} }) };
export const tracer = { startActiveSpan: (n, fn) => fn({ end: () => {} }), startSpan: () => ({ end: () => {} }) };
export default { logger, meter, tracer };
