import { buildHandler } from "../../../observability/probes/handler.ts";
import { memoryChecker } from "../../../observability/probes/memory.ts";

export const liveness = buildHandler(memoryChecker);
