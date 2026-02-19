/** Context types for sections - lightweight, no heavy dependencies */

import type { Context as PreactContext } from "preact";
import { createContext } from "preact";
import type { HttpContext } from "../blocks/handler.ts";
import type { RequestState } from "../blocks/utils.tsx";
import type { Device } from "../utils/userAgent.ts";
import type { ComponentType } from "preact";

export interface SectionContext extends HttpContext<RequestState> {
  renderSalt?: string;
  device: Device;
  deploymentId?: string;
  // deno-lint-ignore no-explicit-any
  FallbackWrapper: ComponentType<any>;
}

/**
 * Preact context for storing section context.
 */
export const SectionContext: PreactContext<SectionContext | undefined> =
  createContext<SectionContext | undefined>(
    undefined,
  );
