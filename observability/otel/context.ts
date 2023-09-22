import { createContextKey } from "npm:@opentelemetry/api";

export const REQUEST_CONTEXT_KEY = createContextKey("Current Request");
export const STATE_CONTEXT_KEY = createContextKey("Application State");
