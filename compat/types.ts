// compat/types.ts
// Type definitions for runtime abstraction layer

export interface DecoEnv {
  get(key: string): string | undefined;
  has(key: string): boolean;
  set(key: string, value: string): void;
  toObject(): Record<string, string | undefined>;
}

export interface DecoFS {
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, content: string): Promise<void>;
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  readDir(
    path: string,
  ): AsyncIterable<{ name: string; isFile: boolean; isDirectory: boolean }>;
  stat(
    path: string,
  ): Promise<{
    isFile: boolean;
    isDirectory: boolean;
    mtime: Date | null;
    size: number;
  }>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  remove(path: string, options?: { recursive?: boolean }): Promise<void>;
  realPath(path: string): Promise<string>;
}

export interface DecoProcess {
  cwd(): string;
  args(): string[];
  exit(code?: number): never;
  pid(): number;
}

export type Runtime = "deno" | "bun" | "node";

