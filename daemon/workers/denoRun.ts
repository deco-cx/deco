import { delay } from "@std/async/delay";
import EventEmitter from "node:events";
import { DaemonMode } from "../../deco.ts";
import { iteratorFrom, logs } from "../loggings/stream.ts";
import type { Isolate, IsolateOptions } from "./isolate.ts";
import { portPool } from "./portpool.ts";
import { waitForPort } from "./utils.ts";

const PORT_WAIT_TIMEOUT_STR = Deno.env.get("PORT_TIMEOUT");
const PORT_WAIT_TIMEOUT = PORT_WAIT_TIMEOUT_STR
  ? +PORT_WAIT_TIMEOUT_STR
  : 60_000;
const permCache: Record<string, Deno.PermissionState> = {};
const buildPermissionsArgs = (
  perm?: Deno.PermissionOptionsObject,
): string[] => {
  if (!perm) {
    return ["-A"];
  }
  const args: string[] = [];
  for (const [key, value] of Object.entries(perm)) {
    if (value === "inherit") {
      permCache[key] ??= Deno.permissions.querySync({
        name: key as Deno.PermissionDescriptor["name"],
      }).state;
      const access = permCache[key];
      access === "granted" && args.push(`--allow-${key}`);
    } else if (value === true) {
      args.push(`--allow-${key}`);
    } else if (Array.isArray(value) || typeof value === "string") {
      const values = Array.isArray(value) ? value : [value];
      args.push(`--allow-${key}=${values.join(",")}`);
    }
  }

  return args;
};
export interface CommandIsolate {
  command: Deno.Command;
  port: number;
}

const isCmdIsolate = (
  cmd: IsolateOptions | CommandIsolate,
): cmd is CommandIsolate => {
  return (cmd as CommandIsolate).command !== undefined;
};
export class DenoRun implements Isolate {
  private ctrl: AbortController | undefined;
  protected child: Deno.ChildProcess | undefined;
  protected inflightRequests = 0;
  protected inflightZeroEmitter = new EventEmitter();
  protected port: number;
  protected command: Deno.Command;
  protected disposed:
    | ReturnType<typeof Promise.withResolvers<void>>
    | undefined;
  protected proxyUrl: string;
  protected client?: Deno.HttpClient;
  constructor(options: IsolateOptions | CommandIsolate) {
    if (isCmdIsolate(options)) {
      this.port = options.port;
      this.command = options.command;
    } else {
      this.port = portPool.get();
      this.command = new Deno.Command(Deno.execPath(), {
        args: [
          "run",
          "--no-prompt",
          "--node-modules-dir=false",
          "--unstable-hmr", // remove this and let restart isolate work.
          ...buildPermissionsArgs(options.permissions),
          "main.ts",
        ],
        cwd: options.cwd,
        stdout: "piped",
        stderr: "piped",
        env: {
          ...options.envVars,
          PORT: `${this.port}`,
          DECOD_MODE: DaemonMode.Sidecar,
        },
      });
    }
    const hostname = Deno.build.os === "windows" ? "localhost" : "0.0.0.0";
    this.proxyUrl = `http://${hostname}:${this.port}`;
    this.client = typeof Deno.createHttpClient === "function"
      ? Deno.createHttpClient({
        allowHost: true,
        proxy: {
          url: this.proxyUrl,
        },
      })
      : undefined;
  }

  signal(sig: Deno.Signal) {
    try {
      this.child?.kill(sig);
    } catch (_er) {
      // ignored
    }
  }
  start(): void {
    if (this.isRunning()) {
      return;
    }
    this.ctrl = new AbortController();
    this.disposed = Promise.withResolvers<void>();
    this.ctrl.signal.onabort = this.dispose.bind(this);
    const child = this.spawn();

    logs.register(iteratorFrom(child.stdout, "info"));
    logs.register(iteratorFrom(child.stderr, "error"));

    this.child = child;
  }

  async dispose() {
    const inflightZero = Promise.withResolvers<void>();
    if (this.inflightRequests > 0) {
      this.inflightZeroEmitter.on("zero", () => {
        inflightZero.resolve();
      });
    } else {
      inflightZero.resolve();
    }
    await Promise.race([inflightZero.promise, delay(10_000)]); // timeout of 10s
    try {
      this.child?.kill("SIGKILL");
    } catch (_err) {
      // ignored
    }
    portPool.free(this.port);
    this.disposed?.resolve();
  }

  fetch(request: Request): Promise<Response> {
    this.inflightRequests++;
    const { pathname, search } = new URL(request.url);
    const url = new URL("." + pathname, this.proxyUrl);
    url.search = search;

    if (request.headers.get("upgrade") === "websocket") {
      return proxyWebSocket(url, request);
    }

    const headers = new Headers(request.headers);
    headers.set("host", request.headers.get("host") ?? url.hostname);

    return fetch(this.client ? request.url : url, {
      method: request.method,
      headers,
      body: request.body,
      redirect: "manual",
      ...this.client ? { client: this.client } : {},
    }).finally(() => {
      this.inflightRequests--;
      if (this.inflightRequests === 0) {
        this.inflightZeroEmitter.emit("zero");
      }
    });
  }
  async [Symbol.asyncDispose](): Promise<void> {
    try {
      !this.ctrl?.signal.aborted && this.ctrl?.abort();
    } finally {
      await this.child?.status;
      await Promise.race([this.disposed?.promise, delay(10_000)]); // timeout of 10s
    }
  }
  isRunning(): boolean {
    return this.ctrl?.signal.aborted === false;
  }
  async waitUntilReady(timeoutMs?: number): Promise<void> {
    await waitForPort(this.port, {
      timeout: timeoutMs ?? PORT_WAIT_TIMEOUT,
      listening: true,
      signal: this.ctrl?.signal,
    });
  }
  private spawn(): Deno.ChildProcess {
    const child = this.command.spawn();
    child.status.then((status) => {
      console.error("child process exit with status code", status.code);
      this.ctrl?.abort();
    });
    return child;
  }
}

function proxyWebSocket(url: URL, nReq: Request) {
  const proxySocket = new WebSocket(url);
  const { response, socket } = Deno.upgradeWebSocket(nReq);

  let proxySocketReady = false;
  let targetSocketReady = false;
  const proxyMessageQueue: string[] = [];
  const targetMessageQueue: string[] = [];

  proxySocket.onopen = () => {
    proxySocketReady = true;
    if (targetSocketReady) {
      flushProxyMessageQueue();
    }
  };

  socket.onopen = () => {
    targetSocketReady = true;
    if (proxySocketReady) {
      flushTargetMessageQueue();
    }
  };

  proxySocket.onmessage = (msg) => {
    if (targetSocketReady) {
      socket.send(msg.data);
    } else {
      proxyMessageQueue.push(msg.data);
    }
  };

  socket.onmessage = (msg) => {
    if (proxySocketReady) {
      proxySocket.send(msg.data);
    } else {
      targetMessageQueue.push(msg.data);
    }
  };

  socket.onclose = () => {
    targetSocketReady = false;
    proxySocket.close();
  };

  proxySocket.onclose = () => {
    proxySocketReady = false;
    socket.close();
  };

  function flushProxyMessageQueue() {
    // Send queued messages received from proxy socket
    while (proxyMessageQueue.length > 0) {
      const msg = proxyMessageQueue.shift();
      msg && socket.send(msg);
    }
  }

  function flushTargetMessageQueue() {
    // Send queued messages received from target socket
    while (targetMessageQueue.length > 0) {
      const msg = targetMessageQueue.shift();
      msg && proxySocket.send(msg);
    }
  }

  return Promise.resolve(response);
}
