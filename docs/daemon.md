# Daemon - Daemon de Desenvolvimento

O diretório `daemon/` contém o daemon de desenvolvimento do deco, responsável
por gerenciar o ambiente de desenvolvimento local, incluindo file watching,
tunnel support, Git integration e process management.

## Visão Geral

O **Daemon** é um processo de background que facilita o desenvolvimento local do
deco, fornecendo funcionalidades como hot-reloading, integração com Git,
tunneling para desenvolvimento remoto e APIs em tempo real.

## Arquitetura

```
daemon/
├── main.ts                 # Ponto de entrada principal
├── daemon.ts               # Lógica principal do daemon
├── auth.ts                 # Autenticação e autorização
├── cmd.ts                  # Execução de comandos
├── tunnel.ts               # Tunneling para desenvolvimento remoto
├── worker.ts               # Gerenciamento de workers
├── monitor.ts              # Monitoramento de atividade
├── meta.ts                 # Gerenciamento de metadados
├── git.ts                  # Integração com Git
├── async.ts                # Utilitários assíncronos e locks
├── fs/                     # Sistema de arquivos
│   ├── api.ts             # APIs de sistema de arquivos
│   └── common.ts          # Funcionalidades comuns
├── workers/                # Gerenciamento de workers
│   ├── denoRun.ts         # Worker Deno
│   ├── isolate.ts         # Isolamento de processos
│   ├── options.ts         # Opções de worker
│   ├── portpool.ts        # Pool de portas
│   └── utils.ts           # Utilitários de workers
├── realtime/              # APIs em tempo real
│   ├── app.ts             # Aplicação realtime
│   ├── types.ts           # Tipos do realtime
│   └── crdt/              # Conflict-free Replicated Data Types
│       ├── bit.ts         # CRDT de bits
│       └── text.ts        # CRDT de texto
├── sse/                   # Server-Sent Events
│   ├── api.ts             # APIs SSE
│   └── channel.ts         # Canal de eventos
└── loggings/              # Sistema de logging
    └── stream.ts          # Stream de logs
```

## Daemon Principal (`daemon.ts`)

### Criação das APIs

```typescript
export const createDaemonAPIs = (options: DaemonOptions): MiddlewareHandler => {
  const app = new Hono();

  // Autenticação
  app.all("/.well-known/deco-validate/:token", (c) => {
    const { token } = c.req.param();
    const decoValidateEnvVar = Deno.env.get("DECO_VALIDATE_TOKEN");
    if (decoValidateEnvVar && token === decoValidateEnvVar) {
      return new Response(decoValidateEnvVar, { status: 200 });
    }
    return new Response(null, { status: 403 });
  });

  app.use(createAuth({ site: options.site }));
  app.post("/update", runCmd("deno", "task", "update"));
  app.route("/git", createGitAPIS(options));
  app.route("/volumes/:id/files", createRealtimeAPIs());
  app.route("/fs", createFSAPIs());
  app.route("", createSSE());

  return async (c, next) => {
    const isDaemonAPI = c.req.header(DAEMON_API_SPECIFIER) ??
      c.req.header(HYPERVISOR_API_SPECIFIER) ??
      c.req.query(DAEMON_API_SPECIFIER) === "true";

    if (!isDaemonAPI) {
      return await next();
    }

    c.res = await app.fetch(c.req.raw);
  };
};
```

### Opções do Daemon

```typescript
interface DaemonOptions {
  site?: string;
  build?: string;
  env?: Record<string, string>;
}
```

## Main Entry Point (`main.ts`)

### Inicialização

```typescript
const createDeps = (): MiddlewareHandler => {
  let ok: Promise<unknown> | null | false = null;

  const start = async () => {
    // Step 1: Git setup
    let start = performance.now();
    await ensureGit({ site: DECO_SITE_NAME! });
    logs.push({
      level: "info",
      message: `Git setup took ${(performance.now() - start).toFixed(0)}ms`,
    });

    // Step 2: Manifest generation
    start = performance.now();
    await genManifestTS();
    logs.push({
      level: "info",
      message: `Manifest generation took ${
        (performance.now() - start).toFixed(0)
      }ms`,
    });

    // Step 3: Blocks metadata generation
    start = performance.now();
    await genBlocksJSON();
    logs.push({
      level: "info",
      message: `Blocks metadata generation took ${
        (performance.now() - start).toFixed(0)
      }ms`,
    });

    // Step 4: Start watchers
    watch().catch(console.error);
    watchMeta().catch(console.error);
    watchFS().catch(console.error);
  };

  return async (c, next) => {
    try {
      ok ||= start();
      await ok.then(next);
    } catch (err) {
      c.res = new Response("Error while starting global deps", { status: 424 });
    }
  };
};
```

### File Watching

```typescript
const watch = async () => {
  const watcher = Deno.watchFs(Deno.cwd(), { recursive: true });

  for await (const event of watcher) {
    using _ = await lockerGitAPI.lock.rlock();
    const skip = event.paths.some((path) =>
      path.includes(".git") || path.includes("node_modules")
    );

    if (skip) continue;

    const isBlockChanged = event.paths.some((path) =>
      path.includes(`${DECO_FOLDER}/${BLOCKS_FOLDER}`)
    );

    if (isBlockChanged) {
      genBlocksJSON();
    }

    const codeCreatedOrDeleted = event.kind !== "modify" &&
      event.kind !== "access" &&
      event.paths.some((path) => (
        /\.tsx?$/.test(path) &&
        !path.includes("manifest.gen.ts")
      ));

    if (codeCreatedOrDeleted) {
      genManifestTS();
    }
  }
};
```

## Git Integration (`git.ts`)

### Operações Git

```typescript
export const createGitAPIS = (options: DaemonOptions) => {
  const app = new Hono();

  app.use(lockerGitAPI.wlock);
  app.use(ensureGit);

  // Status
  app.get("/status", async (c) => {
    const includeDiff = c.req.query("diff") === "true";
    const git = simpleGit(Deno.cwd());

    await git.fetch();
    await git.reset(["--hard", await getMergeBase(git)]);

    const status = await git.status();

    if (includeDiff) {
      const diffResult = await git.diff(["--name-status"]);
      status.files = status.files.map((file) => ({
        ...file,
        diff: diffResult.includes(file.path) ? "modified" : "new",
      }));
    }

    return Response.json(status);
  });

  // Publish
  app.post("/publish", async (c) => {
    const { message, author } = await c.req.json();
    const git = simpleGit(Deno.cwd());

    await git.fetch();
    await git.reset(["--hard", await getMergeBase(git)]);

    await git.add(".");
    await git.commit(message, { "--author": author });
    await git.push();

    return Response.json({ success: true });
  });

  // Discard
  app.post("/discard", async (c) => {
    const { files } = await c.req.json();
    const git = simpleGit(Deno.cwd());

    await git.fetch();
    const mergeBase = await getMergeBase(git);

    for (const file of files) {
      await git.checkout([mergeBase, file]);
    }

    return Response.json({ success: true });
  });

  // Rebase
  app.post("/rebase", async (c) => {
    const git = simpleGit(Deno.cwd());

    await git.add(".");
    await git.commit("WIP: Auto-commit before rebase");
    await git.pull({ "--rebase": null, "--strategy": "theirs" });
    await git.reset(["--hard", await getMergeBase(git)]);

    return Response.json({ success: true });
  });

  // Log
  app.get("/log", async (c) => {
    const limit = parseInt(c.req.query("limit") || "10");
    const git = simpleGit(Deno.cwd());

    const log = await git.log({ maxCount: limit });

    return Response.json(log);
  });

  return app;
};
```

### Merge Base Calculation

```typescript
const getMergeBase = async (git: SimpleGit): Promise<string> => {
  const branches = await git.branch();
  const currentBranch = branches.current;
  const trackingBranch = `origin/${DEFAULT_TRACKING_BRANCH}`;

  try {
    const mergeBase = await git.raw([
      "merge-base",
      currentBranch,
      trackingBranch,
    ]);
    return mergeBase.trim();
  } catch {
    return trackingBranch;
  }
};
```

## Worker Management (`worker.ts`)

### Worker Creation

```typescript
export const createWorker = (optionsProvider: WorkerOptionsProvider) => {
  const app = new Hono();

  const initializeWorker = async () => {
    const initialOpts = await resolveWorkerOptions(optionsProvider);
    wp.resolve(new DenoRun(initialOpts));
  };

  initializeWorker();

  app.use("/*", async (c, next) => {
    try {
      await worker();
      await next();
    } catch (error) {
      console.error(error);
      c.res = new Response(`Error while starting worker`, { status: 424 });
    }
  });

  app.all("/*", (c) => wp.promise.then((w) => w.fetch(c.req.raw)));

  return app;
};
```

### DenoRun Isolate

```typescript
export class DenoRun implements Isolate {
  private ctrl: AbortController | undefined;
  protected child: Deno.ChildProcess | undefined;
  protected inflightRequests = 0;
  protected port: number;
  protected command: Deno.Command;

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
          "--unstable-hmr",
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
  }

  async start(): Promise<void> {
    this.ctrl = new AbortController();
    this.child = this.command.spawn();

    // Pipe stdout/stderr to logs
    this.child.stdout?.pipeTo(
      new WritableStream({
        write: (chunk) => {
          logs.push({
            level: "info",
            message: new TextDecoder().decode(chunk).trim(),
          });
        },
      }),
    );
  }

  async fetch(request: Request): Promise<Response> {
    this.inflightRequests++;

    try {
      return await fetch(this.proxyUrl + new URL(request.url).pathname, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });
    } finally {
      this.inflightRequests--;
      if (this.inflightRequests === 0) {
        this.inflightZeroEmitter.emit("zero");
      }
    }
  }
}
```

## Tunnel Support (`tunnel.ts`)

### Tunnel Registration

```typescript
export async function register(
  { env, site, port, decoHost }: TunnelRegisterOptions,
) {
  const decoHostDomain = `${env}--${site}.deco.host`;
  const { server, domain } = decoHost
    ? {
      server: `wss://${decoHostDomain}`,
      domain: decoHostDomain,
    }
    : {
      server: "wss://simpletunnel.deco.site",
      domain: `${env}--${site}.deco.site`,
    };

  const localAddr = `http://localhost:${port}`;

  await connect({
    domain,
    localAddr,
    server,
    apiKey: Deno.env.get("DECO_TUNNEL_SERVER_TOKEN") ??
      "c309424a-2dc4-46fe-bfc7-a7c10df59477",
  }).then((r) => {
    r.registered.then(() => {
      const admin = new URL(
        `/sites/${site}/spaces/dashboard?env=${env}`,
        "https://admin.deco.cx",
      );

      console.log(
        `\ndeco.cx started environment ${colors.green(env)} for site ${
          colors.brightBlue(site)
        }\n   -> 🌐 ${colors.bold("Preview")}: ${
          colors.cyan(`https://${domain}`)
        }\n   -> ✏️ ${colors.bold("Admin")}: ${colors.cyan(admin.href)}\n`,
      );
    });

    return r.closed.then(async (err) => {
      console.log("tunnel connection error retrying in 500ms...", err);
      await new Promise((resolve) => setTimeout(resolve, 500));
      return register({ env, site, port, decoHost });
    });
  });
}
```

## Realtime APIs (`realtime/app.ts`)

### WebSocket Management

```typescript
export const createRealtimeAPIs = () => {
  const app = new Hono({ strict: true });
  const sessions: Session[] = [];
  const textState = new Map<number, BinaryIndexedTree>();

  const broadcast = (msg: BroadcastMessage) =>
    sessions.forEach((session) => session.socket.send(JSON.stringify(msg)));

  app.get("/", (c) => {
    if (c.req.header("Upgrade") !== "websocket") {
      return new Response("Missing header Upgrade: websocket", { status: 400 });
    }

    const { response, socket } = Deno.upgradeWebSocket(c.req.raw);

    socket.addEventListener("close", () => {
      console.log("admin websocket is closed");
      const index = sessions.findIndex((s) => s.socket === socket);
      if (index > -1) {
        sessions.splice(index, 1);
      }
    });

    socket.addEventListener("open", () => {
      console.log("admin websocket is open");
    });

    sessions.push({ socket });
    return response;
  });

  return app;
};
```

### File System Broadcasting

```typescript
const broadcastFS = async () => {
  const watcher = Deno.watchFs(cwd, { recursive: true });

  for await (const { kind, paths } of watcher) {
    if (kind !== "create" && kind !== "remove" && kind !== "modify") {
      continue;
    }

    const path = paths[0];
    if (path.includes(".git") || path.includes("node_modules")) {
      continue;
    }

    broadcast({
      path: toPosix(path).replace(cwd, ""),
      timestamp: Date.now(),
      deleted: kind === "remove",
    });
  }
};
```

## Meta Management (`meta.ts`)

### Meta Watching

```typescript
export const watchMeta = async () => {
  let etag = "";

  const setMeta = (m: MetaInfo | null) => {
    if (meta && isPromiseLike(meta)) {
      meta.resolve(m);
    }
    meta = m;
  };

  while (true) {
    try {
      const w = await worker();
      const response = await w.fetch(metaRequest(etag));

      if (!response.ok) {
        throw response;
      }

      const m: MetaInfo = await response.json();
      etag = response.headers.get("etag") ?? etag;

      const withExtraParams = { ...m, etag, timestamp: Date.now() };
      filenameBlockTypeMap = updateFilenameBlockTypeMapFromManifest(m.manifest);

      setMeta(withExtraParams);
      broadcast({ type: "meta-info", detail: withExtraParams });
      dispatchWorkerState("ready");
    } catch (error) {
      if (error.status === 404) {
        setMeta(null);
        broadcast({ type: "meta-info", detail: null });
        dispatchWorkerState("ready");
        return;
      }

      dispatchWorkerState("updating");
      console.error(error);
    }
  }
};
```

## Monitoring (`monitor.ts`)

### Activity Monitoring

```typescript
let lastActivity = Date.now();

export const activityMonitor: MiddlewareHandler = async (c, next) => {
  lastActivity = Date.now();

  if (shouldReportActivity && isIdle()) {
    try {
      await fetch(DECO_IDLE_NOTIFICATION_ENDPOINT!, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site: DECO_SITE_NAME,
          env: DECO_ENV_NAME,
          timestamp: lastActivity,
        }),
      });
    } catch (error) {
      console.error("Failed to report activity:", error);
    }
  }

  await next();
};

export const createIdleHandler = (site: string, env: string): Handler => {
  return async (c) => {
    const idle = isIdle();

    return Response.json({
      site,
      env,
      idle,
      lastActivity,
      threshold: DECO_IDLE_THRESHOLD_MINUTES,
    });
  };
};
```

## Concurrency Control (`async.ts`)

### Read-Write Locks

```typescript
export const createLocker = () => {
  const lock = new Mutex();

  const wlock: MiddlewareHandler = async (c, next) => {
    using _ = await lock.acquire();
    await next();
  };

  const rlock: MiddlewareHandler = async (c, next) => {
    using _ = await lock.acquire();
    await next();
  };

  return { wlock, rlock, lock };
};
```

## Logging System (`loggings/stream.ts`)

### Log Streaming

```typescript
export interface LogEntry {
  level: "info" | "warn" | "error";
  message: string;
  timestamp?: number;
}

class LogStream {
  private entries: LogEntry[] = [];
  private streams: WritableStreamDefaultWriter<LogEntry>[] = [];

  push(entry: LogEntry) {
    entry.timestamp = Date.now();
    this.entries.push(entry);

    // Limit log entries
    if (this.entries.length > 1000) {
      this.entries.shift();
    }

    // Broadcast to all streams
    this.streams.forEach((writer) => {
      try {
        writer.write(entry);
      } catch (error) {
        console.error("Failed to write to log stream:", error);
      }
    });
  }

  read(): ReadableStream<LogEntry> | null {
    if (this.entries.length === 0) {
      return null;
    }

    return new ReadableStream({
      start: (controller) => {
        // Send existing entries
        this.entries.forEach((entry) => controller.enqueue(entry));

        // Add to active streams
        const writer = new WritableStreamDefaultWriter(
          new WritableStream({
            write: (entry) => controller.enqueue(entry),
          }),
        );

        this.streams.push(writer);
      },
      cancel: () => {
        // Remove from active streams
        this.streams = this.streams.filter((s) => s !== writer);
      },
    });
  }
}

export const logs = new LogStream();
```

## Exemplo de Uso

```typescript
// Inicializando o daemon
const daemon = await createDaemonAPIs({
  site: "my-site",
  build: "deno task build",
});

// Iniciando servidor
Deno.serve({ port: 8000 }, daemon);

// Registrando tunnel
await register({
  site: "my-site",
  env: "dev",
  port: "8000",
  decoHost: false,
});
```

O daemon fornece uma infraestrutura completa para desenvolvimento local,
incluindo hot-reloading, integração Git, tunneling e APIs em tempo real para uma
experiência de desenvolvimento fluida.
