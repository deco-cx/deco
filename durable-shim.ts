/**
 * Minimal shim for @deco/durable
 * This provides type stubs and no-op implementations for sites that don't use workflows.
 * Real workflow functionality requires the actual @deco/durable package.
 */

// Type exports (no runtime impact)
export type Arg = readonly unknown[];
export type Pagination = { page: number; pageSize: number };
export type RuntimeParameters = Record<string, unknown>;
export type WorkflowExecutionBase = {
  id: string;
  namespace: string;
  status: string;
};
export type WorkflowExecution<
  TArgs extends Arg = Arg,
  TResult = unknown,
  TMetadata = unknown,
> = WorkflowExecutionBase & {
  args: TArgs;
  result?: TResult;
  metadata?: TMetadata;
};
export type Metadata = Record<string, unknown>;
export type Command = { name: string };
export type InvokeHttpEndpointCommand = Command & { name: "invoke_http" };
export type LocalActivityCommand<TResult = unknown, TArgs extends Arg = Arg> =
  Command & {
    name: "local_activity";
    fn: (...args: TArgs) => Promise<TResult>;
    args: TArgs;
  };
export type StoreLocalAcitivtyResult = Command & {
  name: "store_local_activity_result";
};
export type HistoryEvent = {
  id: string;
  type: string;
  timestamp: string;
  visibleAt?: string;
};
export type ActivityCompletedEvent = HistoryEvent & { type: "activity_completed" };
export type ActivityStartedEvent = HistoryEvent & { type: "activity_started" };
export type Event = HistoryEvent;
export type InvokeHttpResponseEvent = HistoryEvent & {
  type: "invoke_http_response";
};
export type LocalActivityCalledEvent = HistoryEvent & {
  type: "local_activity_called";
};
export type NoOpEvent = HistoryEvent & { type: "no_op" };
export type SignalReceivedEvent = HistoryEvent & { type: "signal_received" };
export type TimerFiredEvent = HistoryEvent & { type: "timer_fired" };
export type TimerScheduledEvent = HistoryEvent & { type: "timer_scheduled" };
export type WaitingSignalEvent = HistoryEvent & { type: "waiting_signal" };
export type WorkflowCanceledEvent = HistoryEvent & { type: "workflow_canceled" };
export type WorkflowFinishedEvent = HistoryEvent & { type: "workflow_finished" };
export type WorkflowStartedEvent = HistoryEvent & { type: "workflow_started" };
export type WorkflowGen<TResult = unknown> = AsyncGenerator<Command, TResult>;
export type Channel = { send: (msg: unknown) => Promise<void> };
export type ChannelEncryption = { encrypt: boolean };
export type EncryptedMessage = { encrypted: string };
export type VerifiedMessage = { verified: boolean; data: unknown };
export type JwtIssuer = { sign: (payload: unknown) => Promise<string> };
export type JwtIssuerKeyPair = { public: string; private: string };
export type JwtPayload = Record<string, unknown>;
export type JwtPayloadWithClaims = JwtPayload & { sub?: string; iss?: string };
export type JwtVerifier = { verify: (token: string) => Promise<unknown> };
export type JwksIssuer = { getKeys: () => Promise<unknown> };
export type JwksIssuerOptions = { endpoint: string };
export type JwksKeys = { keys: unknown[] };
export type ClientOptions = { endpoint: string };
export type HttpRunRequest = { workflowId: string };

// WorkflowContext class stub
export class WorkflowContext<TMetadata extends Metadata = Metadata> {
  constructor(public execution: WorkflowExecution<Arg, unknown, TMetadata>) {}

  sleep(_ms: number): Command {
    return { name: "sleep" };
  }

  waitForSignal(_signal: string): Command {
    return { name: "wait_signal" };
  }
}

// Workflow type
export type Workflow<
  TArgs extends Arg = Arg,
  TResult = unknown,
  TCtx extends WorkflowContext = WorkflowContext,
> = (ctx: TCtx, ...args: TArgs) => WorkflowGen<TResult>;

// Function stubs (throw if actually called - indicates real durable is needed)
const notImplemented = (name: string) => () => {
  throw new Error(
    `@deco/durable function "${name}" is not available. Install @deco/durable for workflow support.`,
  );
};

export const asChannel = notImplemented("asChannel");
export const asEncryptedChannel = notImplemented("asEncryptedChannel");
export const asVerifiedChannel = notImplemented("asVerifiedChannel");
export const signedFetch = notImplemented("signedFetch");
export const fetchPublicKey = notImplemented("fetchPublicKey");
export const InvalidSignatureError = class extends Error {};
export const signMessage = notImplemented("signMessage");
export const signRequest = notImplemented("signRequest");
export const stringToBase64SHA256 = notImplemented("stringToBase64SHA256");
export const verifyMessage = notImplemented("verifyMessage");
export const verifySignature = notImplemented("verifySignature");
export const wellKnownJWKSHandler = notImplemented("wellKnownJWKSHandler");
export const importJWK = notImplemented("importJWK");
export const importJWKFromString = notImplemented("importJWKFromString");
export const newJwtIssuer = notImplemented("newJwtIssuer");
export const newJwtVerifier = notImplemented("newJwtVerifier");
export const newJwtVerifierWithJWK = notImplemented("newJwtVerifierWithJWK");
export const newJwksIssuer = notImplemented("newJwksIssuer");
export const workflowRemoteRunner = notImplemented("workflowRemoteRunner");
export const arrToStream = notImplemented("arrToStream");
export const useWorkflowRoutes = notImplemented("useWorkflowRoutes");
export const workflowHTTPHandler = notImplemented("workflowHTTPHandler");
export const workflowWebSocketHandler = notImplemented(
  "workflowWebSocketHandler",
);
export const cancel = notImplemented("cancel");
export const get = notImplemented("get");
export const history = notImplemented("history");
export const init = notImplemented("init");
export const signal = notImplemented("signal");
export const start = notImplemented("start");

