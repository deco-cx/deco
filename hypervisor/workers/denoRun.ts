import EventEmitter from "node:events";
import { delay } from "std/async/delay.ts";
import { Isolate, IsolateOptions } from "./isolate.ts";
import { portPool } from "./portpool.ts";
import { waitForPort } from "./utils.ts";

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
        name: key as keyof Deno.PermissionOptionsObject,
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
  protected cleanUpPromises: Promise<void> | undefined;
  protected inflightRequests = 0;
  protected inflightZeroEmitter = new EventEmitter();
  protected port: number;
  protected command: Deno.Command;
  protected disposed:
    | ReturnType<typeof Promise.withResolvers<void>>
    | undefined;
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
        stdout: "inherit",
        stderr: "inherit",
        env: { ...options.envVars, PORT: `${this.port}` },
      });
    }
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
    const [child, cleanUpPromises] = this.spawn();
    this.child = child;
    this.cleanUpPromises = cleanUpPromises;
  }
  async dispose() {
    this.cleanUpPromises && await this.cleanUpPromises;
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
  fetch(req: Request): Promise<Response> {
    this.inflightRequests++;
    const url = new URL(req.url);
    url.port = `${this.port}`;
    url.hostname = "0.0.0.0";

    if (req.headers.get("upgrade") === "websocket") {
      return proxyWebSocket(url, req);
    }
    const nReq = new Request(url.toString(), req.clone());
    return fetch(nReq).finally(() => {
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
      timeout: timeoutMs ?? 30_000,
      listening: true,
      signal: this.ctrl?.signal,
    });
  }
  private spawn(): [Deno.ChildProcess, Promise<void>] {
    const child = this.command.spawn();
    child.status.then((status) => {
      if (status.code !== 0) {
        console.error("child process failed", status);
        this.ctrl?.abort();
      }
    });
    return [child, Promise.resolve()];
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
