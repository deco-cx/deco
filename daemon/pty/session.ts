export interface PtySessionOptions {
  cmd: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  cols?: number;
  rows?: number;
}

export interface PtySessionInfo {
  id: string;
  status: "running" | "exited";
  exitCode: number | null;
  createdAt: number;
  cmd: string;
}

const POLL_INTERVAL_MS = 50;

/** Shell-escape a single argument for safe inclusion in a command string. */
function shellEscape(arg: string): string {
  if (arg.length === 0) return "''";
  if (!/[^a-zA-Z0-9_./:=@-]/.test(arg)) return arg;
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

// deno-lint-ignore no-explicit-any
type PtyCtor = new (...args: any[]) => any;

// Lazy-loaded Pty constructor to avoid crashing when --unstable-ffi is not enabled.
let _PtyCtor: PtyCtor | null | undefined;

async function loadPty() {
  if (_PtyCtor !== undefined) return _PtyCtor;
  try {
    const mod = await import("@sigma/pty-ffi");
    _PtyCtor = mod.Pty;
  } catch {
    _PtyCtor = null;
  }
  return _PtyCtor;
}

export class PtySession {
  readonly id: string;
  readonly createdAt: number;
  readonly cmd: string;

  // deno-lint-ignore no-explicit-any
  #pty: any;
  #status: "running" | "exited" = "running";
  #exitCode: number | null = null;
  #dataCallbacks: Array<(data: string) => void> = [];
  #exitCallbacks: Array<(code: number) => void> = [];
  #pollTimer: number | undefined;
  #outputBuffer: string[] = [];
  #maxBufferLines = 1000;

  get status() {
    return this.#status;
  }

  get exitCode() {
    return this.#exitCode;
  }

  get outputBuffer(): readonly string[] {
    return this.#outputBuffer;
  }

  // deno-lint-ignore no-explicit-any
  private constructor(pty: any, opts: PtySessionOptions) {
    this.id = crypto.randomUUID().slice(0, 8);
    this.createdAt = Date.now();
    this.cmd = opts.cmd;
    this.#pty = pty;

    if (opts.cols && opts.rows) {
      this.#pty.resize({ rows: opts.rows, cols: opts.cols });
    }

    this.#startPolling();
  }

  static async create(opts: PtySessionOptions): Promise<PtySession> {
    const PtyCtor = await loadPty();
    if (!PtyCtor) {
      throw new Error(
        "PTY support is not available. Run with --unstable-ffi to enable it.",
      );
    }

    const cmdWithArgs = opts.args?.length
      ? `${shellEscape(opts.cmd)} ${opts.args.map(shellEscape).join(" ")}`
      : opts.cmd;

    const pty = new PtyCtor(cmdWithArgs, {
      env: opts.env,
      cwd: opts.cwd,
    });

    return new PtySession(pty, opts);
  }

  #startPolling(): void {
    this.#pollTimer = setInterval(() => {
      this.#poll();
    }, POLL_INTERVAL_MS);
  }

  #poll(): void {
    try {
      const result = this.#pty.read();
      if (result.data) {
        this.#pushOutput(result.data);
        for (const cb of this.#dataCallbacks) {
          cb(result.data);
        }
      }
      if (result.done) {
        this.#finish();
      }
    } catch {
      this.#finish();
    }
  }

  #finish(): void {
    if (this.#status === "exited") return;
    clearInterval(this.#pollTimer);
    this.#status = "exited";
    const code = this.#pty.exitCode ?? 0;
    this.#exitCode = code;
    for (const cb of this.#exitCallbacks) {
      cb(code);
    }
  }

  #pushOutput(data: string) {
    this.#outputBuffer.push(data);
    if (this.#outputBuffer.length > this.#maxBufferLines) {
      this.#outputBuffer.shift();
    }
  }

  write(data: string): void {
    this.#pty.write(data);
  }

  resize(cols: number, rows: number): void {
    this.#pty.resize({ rows, cols });
  }

  kill(): void {
    this.#pty.close();
  }

  onData(cb: (data: string) => void): () => void {
    this.#dataCallbacks.push(cb);
    return () => {
      this.#dataCallbacks = this.#dataCallbacks.filter((c) => c !== cb);
    };
  }

  onExit(cb: (code: number) => void): () => void {
    if (this.#status === "exited") {
      cb(this.#exitCode ?? 0);
      return () => {};
    }
    this.#exitCallbacks.push(cb);
    return () => {
      this.#exitCallbacks = this.#exitCallbacks.filter((c) => c !== cb);
    };
  }

  info(): PtySessionInfo {
    return {
      id: this.id,
      status: this.#status,
      exitCode: this.#exitCode,
      createdAt: this.createdAt,
      cmd: this.cmd,
    };
  }

  dispose(): void {
    if (this.#status === "running") {
      this.kill();
    }
    clearInterval(this.#pollTimer);
    this.#dataCallbacks = [];
    this.#exitCallbacks = [];
  }
}
