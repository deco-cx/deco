/**
 * Shim for @std/log
 * Provides logging utilities compatible with Deno's std/log
 */

export enum LogLevel {
  NOTSET = 0,
  DEBUG = 10,
  INFO = 20,
  WARN = 30,
  WARNING = 30,
  ERROR = 40,
  CRITICAL = 50,
}

// Alias for compatibility
export const LogLevels = LogLevel;

// Level names as type and runtime value
export type LevelName = "NOTSET" | "DEBUG" | "INFO" | "WARN" | "WARNING" | "ERROR" | "CRITICAL";
export const LevelNames = ["NOTSET", "DEBUG", "INFO", "WARN", "WARNING", "ERROR", "CRITICAL"] as const;

export const LogLevelNames: Record<number, string> = {
  [LogLevel.NOTSET]: "NOTSET",
  [LogLevel.DEBUG]: "DEBUG",
  [LogLevel.INFO]: "INFO",
  [LogLevel.WARN]: "WARN",
  [LogLevel.ERROR]: "ERROR",
  [LogLevel.CRITICAL]: "CRITICAL",
};

export interface LogRecord {
  msg: string;
  args: unknown[];
  level: number;
  levelName: string;
  loggerName: string;
  datetime: Date;
}

export interface HandlerOptions {
  formatter?: string | ((logRecord: LogRecord) => string);
}

export class BaseHandler {
  level: number;
  levelName: string;
  formatter: string | ((logRecord: LogRecord) => string);

  constructor(levelName: string, options: HandlerOptions = {}) {
    this.levelName = levelName;
    this.level = LogLevel[levelName as keyof typeof LogLevel] ?? LogLevel.INFO;
    this.formatter = options.formatter ?? "{levelName} {msg}";
  }

  handle(logRecord: LogRecord): void {
    if (logRecord.level >= this.level) {
      this.log(this.format(logRecord));
    }
  }

  format(logRecord: LogRecord): string {
    if (typeof this.formatter === "function") {
      return this.formatter(logRecord);
    }
    return this.formatter
      .replace("{levelName}", logRecord.levelName)
      .replace("{msg}", logRecord.msg)
      .replace("{datetime}", logRecord.datetime.toISOString())
      .replace("{loggerName}", logRecord.loggerName);
  }

  log(msg: string): void {
    console.log(msg);
  }
}

export class ConsoleHandler extends BaseHandler {
  override log(msg: string): void {
    console.log(msg);
  }
}

export class FileHandler extends BaseHandler {
  constructor(levelName: string, options: HandlerOptions & { filename?: string } = {}) {
    super(levelName, options);
    // File handling not implemented in Node.js shim - just log to console
  }

  override log(msg: string): void {
    console.log(msg);
  }
}

export class Logger {
  #level: number;
  #handlers: BaseHandler[];
  #loggerName: string;

  constructor(
    loggerName: string,
    levelName: string,
    options: { handlers?: BaseHandler[] } = {},
  ) {
    this.#loggerName = loggerName;
    this.#level = LogLevel[levelName as keyof typeof LogLevel] ?? LogLevel.INFO;
    this.#handlers = options.handlers ?? [new ConsoleHandler("DEBUG")];
  }

  get level(): number {
    return this.#level;
  }

  set level(level: number) {
    this.#level = level;
  }

  get levelName(): string {
    return LogLevelNames[this.#level] ?? "NOTSET";
  }

  get loggerName(): string {
    return this.#loggerName;
  }

  get handlers(): BaseHandler[] {
    return this.#handlers;
  }

  #log(level: number, msg: string, ...args: unknown[]): void {
    if (level < this.#level) return;

    const logRecord: LogRecord = {
      msg: args.length > 0 ? this.#format(msg, args) : msg,
      args,
      level,
      levelName: LogLevelNames[level] ?? "NOTSET",
      loggerName: this.#loggerName,
      datetime: new Date(),
    };

    for (const handler of this.#handlers) {
      handler.handle(logRecord);
    }
  }

  #format(msg: string, args: unknown[]): string {
    let result = msg;
    for (const arg of args) {
      result = result.replace("{}", String(arg));
    }
    return result;
  }

  debug(msg: string, ...args: unknown[]): void {
    this.#log(LogLevel.DEBUG, msg, ...args);
  }

  info(msg: string, ...args: unknown[]): void {
    this.#log(LogLevel.INFO, msg, ...args);
  }

  warn(msg: string, ...args: unknown[]): void {
    this.#log(LogLevel.WARN, msg, ...args);
  }

  warning(msg: string, ...args: unknown[]): void {
    this.warn(msg, ...args);
  }

  error(msg: string, ...args: unknown[]): void {
    this.#log(LogLevel.ERROR, msg, ...args);
  }

  critical(msg: string, ...args: unknown[]): void {
    this.#log(LogLevel.CRITICAL, msg, ...args);
  }
}

// Global loggers registry
const loggers = new Map<string, Logger>();

export function getLogger(name = "default"): Logger {
  let logger = loggers.get(name);
  if (!logger) {
    logger = new Logger(name, "INFO");
    loggers.set(name, logger);
  }
  return logger;
}

export interface LogConfig {
  handlers?: Record<string, BaseHandler>;
  loggers?: Record<string, { level: string; handlers?: string[] }>;
}

export function setup(config: LogConfig): void {
  const handlers = config.handlers ?? {};
  const loggerConfigs = config.loggers ?? {};

  for (const [name, loggerConfig] of Object.entries(loggerConfigs)) {
    const loggerHandlers: BaseHandler[] = [];
    for (const handlerName of loggerConfig.handlers ?? []) {
      const handler = handlers[handlerName];
      if (handler) {
        loggerHandlers.push(handler);
      }
    }
    const logger = new Logger(name, loggerConfig.level, {
      handlers: loggerHandlers.length > 0 ? loggerHandlers : undefined,
    });
    loggers.set(name, logger);
  }
}

// Convenience functions using default logger
export function debug(msg: string, ...args: unknown[]): void {
  getLogger().debug(msg, ...args);
}

export function info(msg: string, ...args: unknown[]): void {
  getLogger().info(msg, ...args);
}

export function warn(msg: string, ...args: unknown[]): void {
  getLogger().warn(msg, ...args);
}

export function warning(msg: string, ...args: unknown[]): void {
  getLogger().warning(msg, ...args);
}

export function error(msg: string, ...args: unknown[]): void {
  getLogger().error(msg, ...args);
}

export function critical(msg: string, ...args: unknown[]): void {
  getLogger().critical(msg, ...args);
}
