# Utils - Utilitários

O diretório `utils/` contém utilitários diversos utilizados em todo o projeto
deco, fornecendo funcionalidades fundamentais para HTTP, JSON, promises,
objetos, device detection e muito mais.

## Arquitetura

```
utils/
├── mod.ts                  # Exportações principais
├── admin.ts               # Utilitários para admin
├── async.ts               # Utilitários assíncronos
├── cookies.ts             # Manipulação de cookies
├── dataURI.ts             # Manipulação de Data URIs
├── device.ts              # Detecção de dispositivos
├── encoding.ts            # Codificação/decodificação
├── fetchAPI.ts            # Utilitários de fetch
├── filesystem.ts          # Operações de sistema de arquivos
├── hasher.ts              # Funções de hash
├── http.ts                # Utilitários HTTP
├── invoke.server.ts       # Invocação server-side
├── invoke.ts              # Sistema de invocação
├── invoke.types.ts        # Tipos de invocação
├── json.ts                # Manipulação de JSON
├── log.ts                 # Logging
├── metabase.tsx           # Componente Metabase
├── object.ts              # Manipulação de objetos
├── page.ts                # Utilitários de página
├── patched_fetch.ts       # Fetch com patches
├── promise.ts             # Utilitários de promises
├── rand.ts                # Geração de números aleatórios
├── segment.ts             # Segmentação
├── stat.ts                # Estatísticas
├── sync.ts                # Sincronização
├── timings.ts             # Timing de servidor
├── unique.ts              # Identificadores únicos
├── userAgent.ts           # Detecção de user agent
└── vary.ts                # Headers Vary
```

## Funcionalidades Principais

### HTTP Utilities (`http.ts`)

```typescript
export const defaultHeaders = {
  "Content-Type": "application/json",
  "X-Powered-By": "deco.cx",
};

export const allowCorsFor = (origin: string): Record<string, string> => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
});

export const forceHttps = (request: Request): Request => {
  const url = new URL(request.url);
  if (url.protocol === "http:" && url.hostname !== "localhost") {
    url.protocol = "https:";
    return new Request(url.toString(), request);
  }
  return request;
};

export const bodyFromUrl = (url: string): FormData | null => {
  const urlObj = new URL(url);
  const formData = new FormData();

  for (const [key, value] of urlObj.searchParams) {
    formData.append(key, value);
  }

  return formData.entries().next().done ? null : formData;
};
```

### Device Detection (`device.ts`)

```typescript
export interface Device {
  type: "mobile" | "tablet" | "desktop";
  vendor?: string;
  model?: string;
  os?: string;
  browser?: string;
}

export const deviceOf = (request: Request): Device => {
  const userAgent = request.headers.get("user-agent") || "";

  // Mobile detection
  if (
    /Mobile|Android|iP(hone|od|ad)|Opera Mini|BlackBerry|IEMobile|Windows Phone/i
      .test(userAgent)
  ) {
    return {
      type: "mobile",
      vendor: detectVendor(userAgent),
      model: detectModel(userAgent),
      os: detectOS(userAgent),
      browser: detectBrowser(userAgent),
    };
  }

  // Tablet detection
  if (/Tablet|iPad|PlayBook|Silk|Android(?!.*Mobile)/i.test(userAgent)) {
    return {
      type: "tablet",
      vendor: detectVendor(userAgent),
      model: detectModel(userAgent),
      os: detectOS(userAgent),
      browser: detectBrowser(userAgent),
    };
  }

  return {
    type: "desktop",
    os: detectOS(userAgent),
    browser: detectBrowser(userAgent),
  };
};
```

### JSON Utilities (`json.ts`)

```typescript
export const safeJsonParse = <T = any>(json: string): T | null => {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
};

export const safeJsonStringify = (obj: any, space?: number): string => {
  try {
    return JSON.stringify(obj, null, space);
  } catch {
    return "{}";
  }
};

export const deepMerge = <T>(target: T, source: Partial<T>): T => {
  const result = { ...target };

  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      if (isObject(source[key]) && isObject(result[key])) {
        result[key] = deepMerge(result[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
  }

  return result;
};

const isObject = (obj: any): boolean => {
  return obj && typeof obj === "object" && !Array.isArray(obj);
};
```

### Promise Utilities (`promise.ts`)

```typescript
export const deferred = <T = any>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: any) => void;
} => {
  let resolve: (value: T) => void;
  let reject: (reason?: any) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve: resolve!, reject: reject! };
};

export const timeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Promise timed out after ${ms}ms`));
    }, ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (reason) => {
        clearTimeout(timer);
        reject(reason);
      },
    );
  });
};

export const retry = async <T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  delay: number = 1000,
): Promise<T> => {
  let lastError: Error;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError!;
};
```

### Object Utilities (`object.ts`)

```typescript
export type DotNestedKeys<T> = {
  [K in keyof T]: T[K] extends object ? `${K & string}.${DotNestedKeys<T[K]>}`
    : K & string;
}[keyof T];

export const get = <T, K extends DotNestedKeys<T>>(
  obj: T,
  path: K,
): any => {
  const keys = path.split(".");
  let result: any = obj;

  for (const key of keys) {
    if (result === null || result === undefined) {
      return undefined;
    }
    result = result[key];
  }

  return result;
};

export const set = <T>(obj: T, path: string, value: any): void => {
  const keys = path.split(".");
  let current: any = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current) || typeof current[key] !== "object") {
      current[key] = {};
    }
    current = current[key];
  }

  current[keys[keys.length - 1]] = value;
};

export const pick = <T, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> => {
  const result = {} as Pick<T, K>;

  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }

  return result;
};

export const omit = <T, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> => {
  const result = { ...obj };

  for (const key of keys) {
    delete result[key];
  }

  return result;
};

export const tryOrDefault = <T>(fn: () => T, defaultValue: T): T => {
  try {
    return fn();
  } catch {
    return defaultValue;
  }
};
```

### Cookie Utilities (`cookies.ts`)

```typescript
export interface Cookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: Date;
  maxAge?: number;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "strict" | "lax" | "none";
}

export const setCookie = (headers: Headers, cookie: Cookie): void => {
  let cookieString = `${cookie.name}=${cookie.value}`;

  if (cookie.domain) cookieString += `; Domain=${cookie.domain}`;
  if (cookie.path) cookieString += `; Path=${cookie.path}`;
  if (cookie.expires) {
    cookieString += `; Expires=${cookie.expires.toUTCString()}`;
  }
  if (cookie.maxAge !== undefined) cookieString += `; Max-Age=${cookie.maxAge}`;
  if (cookie.secure) cookieString += "; Secure";
  if (cookie.httpOnly) cookieString += "; HttpOnly";
  if (cookie.sameSite) cookieString += `; SameSite=${cookie.sameSite}`;

  headers.append("Set-Cookie", cookieString);
};

export const getCookies = (headers: Headers): Record<string, string> => {
  const cookieHeader = headers.get("Cookie");
  if (!cookieHeader) return {};

  const cookies: Record<string, string> = {};

  cookieHeader.split(";").forEach((cookie) => {
    const [name, value] = cookie.trim().split("=");
    if (name && value) {
      cookies[name] = value;
    }
  });

  return cookies;
};

export const deleteCookie = (headers: Headers, name: string): void => {
  setCookie(headers, {
    name,
    value: "",
    expires: new Date(0),
  });
};
```

### Server Timings (`timings.ts`)

```typescript
export interface ServerTimings {
  start(name: string): void;
  end(name: string): void;
  measure(name: string, fn: () => void): void;
  measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T>;
  toHeaders(): Record<string, string>;
}

export const createServerTimings = (): ServerTimings => {
  const timings = new Map<string, number>();
  const starts = new Map<string, number>();

  return {
    start(name: string): void {
      starts.set(name, performance.now());
    },

    end(name: string): void {
      const start = starts.get(name);
      if (start !== undefined) {
        timings.set(name, performance.now() - start);
        starts.delete(name);
      }
    },

    measure(name: string, fn: () => void): void {
      const start = performance.now();
      fn();
      timings.set(name, performance.now() - start);
    },

    async measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
      const start = performance.now();
      const result = await fn();
      timings.set(name, performance.now() - start);
      return result;
    },

    toHeaders(): Record<string, string> {
      const entries = Array.from(timings.entries())
        .map(([name, duration]) => `${name};dur=${duration.toFixed(2)}`)
        .join(", ");

      return entries ? { "Server-Timing": entries } : {};
    },
  };
};
```

### Vary Header Utilities (`vary.ts`)

```typescript
export interface VaryFunc {
  add(header: string): void;
  toString(): string;
}

export const vary = (): VaryFunc => {
  const headers = new Set<string>();

  return {
    add(header: string): void {
      headers.add(header.toLowerCase());
    },

    toString(): string {
      return Array.from(headers).join(", ");
    },
  };
};

export interface DebugProperties {
  enabled: boolean;
  correlationId?: string;
  action: (response: Response) => void;
}

export const DEBUG = {
  fromRequest(request: Request): DebugProperties {
    const url = new URL(request.url);
    const enabled = url.searchParams.has("debug");
    const correlationId = url.searchParams.get("correlationId") || undefined;

    return {
      enabled,
      correlationId,
      action: (response: Response) => {
        if (enabled) {
          response.headers.set("X-Debug-Enabled", "true");
          if (correlationId) {
            response.headers.set("X-Correlation-ID", correlationId);
          }
        }
      },
    };
  },
};
```

### Async Utilities (`async.ts`)

```typescript
export const delay = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

export const throttle = <T extends (...args: any[]) => any>(
  fn: T,
  ms: number,
): T => {
  let lastCall = 0;
  let timeout: number | null = null;

  return ((...args: Parameters<T>) => {
    const now = Date.now();

    if (now - lastCall >= ms) {
      lastCall = now;
      return fn(...args);
    }

    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(() => {
      lastCall = Date.now();
      fn(...args);
    }, ms - (now - lastCall));
  }) as T;
};

export const debounce = <T extends (...args: any[]) => any>(
  fn: T,
  ms: number,
): T => {
  let timeout: number | null = null;

  return ((...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(() => fn(...args), ms);
  }) as T;
};
```

### Unique Identifiers (`unique.ts`)

```typescript
export const ulid = (): string => {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substr(2);
  return `${timestamp}${randomPart}`;
};

export const uuid = (): string => {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

export const shortId = (length: number = 8): string => {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";

  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return result;
};
```

### Admin Utilities (`admin.ts`)

```typescript
export const isAdminOrLocalhost = (request: Request): boolean => {
  const url = new URL(request.url);
  const hostname = url.hostname;

  return hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".admin.deco.cx");
};

export const requireAdmin = (request: Request): void => {
  if (!isAdminOrLocalhost(request)) {
    throw new Error("Admin access required");
  }
};
```

## Exemplo de Uso

```typescript
// Device detection
const device = deviceOf(request);
if (device.type === "mobile") {
  // Mobile-specific logic
}

// Server timings
const timings = createServerTimings();
timings.start("database");
await queryDatabase();
timings.end("database");

// Add to response headers
Object.assign(response.headers, timings.toHeaders());

// Promise utilities
const result = await retry(
  () => fetchData(),
  3,
  1000,
);

// Object manipulation
const user = {
  profile: {
    name: "John",
    age: 30,
  },
};

const name = get(user, "profile.name"); // 'John'
set(user, "profile.email", "john@example.com");

// Cookie management
setCookie(response.headers, {
  name: "session",
  value: "abc123",
  httpOnly: true,
  sameSite: "lax",
});
```

O diretório utils fornece uma base sólida de utilitários que são utilizados em
todo o framework deco, simplificando tarefas comuns e proporcionando
funcionalidades robustas.
