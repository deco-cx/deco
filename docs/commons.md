# Commons - Utilitários e Funcionalidades Compartilhadas

O diretório `commons/` contém utilitários e funcionalidades compartilhadas que
são utilizadas em todo o framework deco.

## Visão Geral

O **Commons** fornece funcionalidades fundamentais como JWT handling, sistema de
workflows duráveis e lógica de inicialização comum, servindo como base para
outras partes do framework.

## Arquitetura

```
commons/
├── jwt/                    # Sistema completo de JWT
│   ├── mod.ts             # Exportações principais
│   ├── engine.ts          # Engine principal de JWT
│   ├── jwks.ts            # JSON Web Key Set
│   ├── keys.ts            # Gerenciamento de chaves
│   ├── jwt.ts             # Implementação JWT
│   └── trusted.ts         # Autoridades confiáveis
├── workflows/             # Sistema de workflows duráveis
│   ├── mod.ts             # Exportações principais
│   ├── initialize.ts      # Inicialização de workflows
│   └── types.ts           # Tipos de workflows
```

## JWT System (`jwt/`)

### Engine JWT (`engine.ts`)

O engine JWT fornece funcionalidades completas de validação e criação de tokens:

```typescript
export interface JWTEngine {
  verify(token: string, options?: VerifyOptions): Promise<JWTPayload>;
  sign(payload: JWTPayload, options?: SignOptions): Promise<string>;
  decode(token: string): Promise<JWTPayload>;
}

export interface VerifyOptions {
  audience?: string | string[];
  issuer?: string | string[];
  subject?: string;
  clockTolerance?: number;
  maxTokenAge?: number;
  algorithms?: string[];
}

export interface SignOptions {
  audience?: string | string[];
  issuer?: string;
  subject?: string;
  expiresIn?: number;
  notBefore?: number;
  algorithm?: string;
}

export class DefaultJWTEngine implements JWTEngine {
  private keys: KeyManager;
  private trustedIssuers: Set<string>;

  constructor(keys: KeyManager, trustedIssuers: string[] = []) {
    this.keys = keys;
    this.trustedIssuers = new Set(trustedIssuers);
  }

  async verify(
    token: string,
    options: VerifyOptions = {},
  ): Promise<JWTPayload> {
    const parts = token.split(".");
    if (parts.length !== 3) {
      throw new Error("Invalid JWT format");
    }

    const [headerB64, payloadB64, signatureB64] = parts;

    // Decode header
    const header = JSON.parse(atob(headerB64));
    const payload = JSON.parse(atob(payloadB64));

    // Verify issuer if specified
    if (options.issuer) {
      const issuers = Array.isArray(options.issuer)
        ? options.issuer
        : [options.issuer];
      if (!issuers.includes(payload.iss)) {
        throw new Error(`Invalid issuer: ${payload.iss}`);
      }
    }

    // Verify audience if specified
    if (options.audience) {
      const audiences = Array.isArray(options.audience)
        ? options.audience
        : [options.audience];
      const tokenAudience = Array.isArray(payload.aud)
        ? payload.aud
        : [payload.aud];

      if (!audiences.some((aud) => tokenAudience.includes(aud))) {
        throw new Error(`Invalid audience: ${payload.aud}`);
      }
    }

    // Verify expiration
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      throw new Error("Token expired");
    }

    // Verify not before
    if (payload.nbf && Date.now() < payload.nbf * 1000) {
      throw new Error("Token not yet valid");
    }

    // Verify signature
    const key = await this.keys.getKey(header.kid);
    if (!key) {
      throw new Error(`Key not found: ${header.kid}`);
    }

    const signatureData = `${headerB64}.${payloadB64}`;
    const isValid = await this.verifySignature(
      signatureData,
      signatureB64,
      key,
      header.alg,
    );

    if (!isValid) {
      throw new Error("Invalid signature");
    }

    return payload;
  }

  async sign(payload: JWTPayload, options: SignOptions = {}): Promise<string> {
    const now = Math.floor(Date.now() / 1000);

    const fullPayload = {
      ...payload,
      iat: now,
      ...(options.expiresIn && { exp: now + options.expiresIn }),
      ...(options.notBefore && { nbf: now + options.notBefore }),
      ...(options.issuer && { iss: options.issuer }),
      ...(options.audience && { aud: options.audience }),
      ...(options.subject && { sub: options.subject }),
    };

    const header = {
      alg: options.algorithm || "HS256",
      typ: "JWT",
    };

    const headerB64 = btoa(JSON.stringify(header));
    const payloadB64 = btoa(JSON.stringify(fullPayload));
    const signatureData = `${headerB64}.${payloadB64}`;

    const key = await this.keys.getSigningKey();
    const signature = await this.createSignature(
      signatureData,
      key,
      header.alg,
    );

    return `${headerB64}.${payloadB64}.${signature}`;
  }
}
```

### Key Management (`keys.ts`)

Sistema de gerenciamento de chaves para JWT:

```typescript
export interface KeyManager {
  getKey(kid: string): Promise<CryptoKey | null>;
  getSigningKey(): Promise<CryptoKey>;
  rotateKeys(): Promise<void>;
}

export interface JWK {
  kid: string;
  kty: string;
  alg: string;
  use: string;
  n?: string;
  e?: string;
  k?: string;
}

export class DefaultKeyManager implements KeyManager {
  private keys: Map<string, CryptoKey> = new Map();
  private signingKey: CryptoKey | null = null;
  private jwks: JWKS | null = null;

  constructor(private jwksUrl?: string) {}

  async getKey(kid: string): Promise<CryptoKey | null> {
    if (this.keys.has(kid)) {
      return this.keys.get(kid)!;
    }

    // Try to load from JWKS
    if (this.jwksUrl) {
      await this.loadJWKS();
      return this.keys.get(kid) || null;
    }

    return null;
  }

  async getSigningKey(): Promise<CryptoKey> {
    if (!this.signingKey) {
      this.signingKey = await this.generateSigningKey();
    }
    return this.signingKey;
  }

  private async loadJWKS(): Promise<void> {
    if (!this.jwksUrl) return;

    try {
      const response = await fetch(this.jwksUrl);
      this.jwks = await response.json();

      for (const jwk of this.jwks.keys) {
        const key = await this.jwkToCryptoKey(jwk);
        this.keys.set(jwk.kid, key);
      }
    } catch (error) {
      console.error("Failed to load JWKS:", error);
    }
  }

  private async generateSigningKey(): Promise<CryptoKey> {
    return await crypto.subtle.generateKey(
      {
        name: "HMAC",
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    );
  }

  private async jwkToCryptoKey(jwk: JWK): Promise<CryptoKey> {
    if (jwk.kty === "oct") {
      return await crypto.subtle.importKey(
        "raw",
        new Uint8Array(atob(jwk.k!).split("").map((c) => c.charCodeAt(0))),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"],
      );
    }

    if (jwk.kty === "RSA") {
      return await crypto.subtle.importKey(
        "jwk",
        jwk,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"],
      );
    }

    throw new Error(`Unsupported key type: ${jwk.kty}`);
  }
}
```

### JWKS Support (`jwks.ts`)

JSON Web Key Set para descoberta de chaves:

```typescript
export interface JWKS {
  keys: JWK[];
}

export class JWKSProvider {
  private cache: Map<string, JWKS> = new Map();
  private cacheTTL: number = 5 * 60 * 1000; // 5 minutes

  async getJWKS(url: string): Promise<JWKS> {
    const cached = this.cache.get(url);
    if (cached) {
      return cached;
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch JWKS: ${response.status}`);
    }

    const jwks: JWKS = await response.json();
    this.cache.set(url, jwks);

    // Set cache expiration
    setTimeout(() => {
      this.cache.delete(url);
    }, this.cacheTTL);

    return jwks;
  }

  async getKey(jwksUrl: string, kid: string): Promise<JWK | null> {
    const jwks = await this.getJWKS(jwksUrl);
    return jwks.keys.find((key) => key.kid === kid) || null;
  }
}
```

### Trusted Authorities (`trusted.ts`)

Sistema de autoridades confiáveis:

```typescript
export interface TrustedAuthority {
  issuer: string;
  jwksUrl: string;
  audience?: string[];
  algorithms?: string[];
}

export class TrustedAuthorityManager {
  private authorities: Map<string, TrustedAuthority> = new Map();
  private jwksProvider: JWKSProvider;

  constructor() {
    this.jwksProvider = new JWKSProvider();
  }

  addAuthority(authority: TrustedAuthority): void {
    this.authorities.set(authority.issuer, authority);
  }

  removeAuthority(issuer: string): void {
    this.authorities.delete(issuer);
  }

  async verifyToken(token: string): Promise<JWTPayload> {
    const payload = JSON.parse(atob(token.split(".")[1]));
    const issuer = payload.iss;

    if (!issuer) {
      throw new Error("Token missing issuer");
    }

    const authority = this.authorities.get(issuer);
    if (!authority) {
      throw new Error(`Untrusted issuer: ${issuer}`);
    }

    const engine = new DefaultJWTEngine(
      new DefaultKeyManager(authority.jwksUrl),
      [authority.issuer],
    );

    return await engine.verify(token, {
      issuer: authority.issuer,
      audience: authority.audience,
      algorithms: authority.algorithms,
    });
  }
}
```

## Workflows System (`workflows/`)

### Initialize (`initialize.ts`)

Inicialização do sistema de workflows:

```typescript
export interface WorkflowInitializer {
  init(): Promise<void>;
  shutdown(): Promise<void>;
}

export class DefaultWorkflowInitializer implements WorkflowInitializer {
  private initialized = false;
  private durableClient: DurableClient | null = null;

  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      // Initialize durable client
      this.durableClient = new DurableClient({
        endpoint: Deno.env.get("DURABLE_ENDPOINT") || "http://localhost:8080",
        apiKey: Deno.env.get("DURABLE_API_KEY"),
      });

      // Initialize workflow runtime
      await this.durableClient.connect();

      console.log("Workflow system initialized");
      this.initialized = true;
    } catch (error) {
      console.error("Failed to initialize workflow system:", error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    if (!this.initialized) return;

    try {
      await this.durableClient?.disconnect();
      this.initialized = false;
      console.log("Workflow system shut down");
    } catch (error) {
      console.error("Failed to shutdown workflow system:", error);
    }
  }
}

let initializer: WorkflowInitializer | null = null;

export const initOnce = async (): Promise<void> => {
  if (!initializer) {
    initializer = new DefaultWorkflowInitializer();
    await initializer.init();

    // Register shutdown handler
    if (Deno.build.os !== "windows") {
      Deno.addSignalListener("SIGTERM", async () => {
        await initializer?.shutdown();
        Deno.exit(0);
      });
    }
  }
};
```

### Types (`types.ts`)

Tipos para o sistema de workflows:

```typescript
export interface WorkflowMetadata {
  id: string;
  name: string;
  version: string;
  createdAt: Date;
  updatedAt: Date;
  status: WorkflowStatus;
  defaultInvokeHeaders?: Record<string, string>;
}

export enum WorkflowStatus {
  PENDING = "pending",
  RUNNING = "running",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled",
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  input: unknown;
  output?: unknown;
  error?: string;
  status: WorkflowStatus;
  startedAt: Date;
  completedAt?: Date;
  metadata: WorkflowMetadata;
}

export interface WorkflowActivity {
  name: string;
  input: unknown;
  output?: unknown;
  error?: string;
  attempts: number;
  maxAttempts: number;
  timeout: number;
  retryPolicy: RetryPolicy;
}

export interface RetryPolicy {
  maxAttempts: number;
  initialInterval: number;
  maxInterval: number;
  backoffMultiplier: number;
  nonRetryableErrors?: string[];
}

export interface WorkflowQS {
  extractFromUrl(url: string): string | null;
  addToUrl(url: string, workflowId: string): string;
}

export const WorkflowQS: WorkflowQS = {
  extractFromUrl(url: string): string | null {
    const u = new URL(url);
    return u.searchParams.get("workflow");
  },

  addToUrl(url: string, workflowId: string): string {
    const u = new URL(url);
    u.searchParams.set("workflow", workflowId);
    return u.toString();
  },
};
```

### Workflow Context

```typescript
export interface WorkflowContext {
  workflowId: string;
  executionId: string;
  startedAt: Date;
  input: unknown;

  // Activity execution
  executeActivity<T>(
    activityName: string,
    input: unknown,
    options?: ActivityOptions,
  ): Promise<T>;

  // Timer functionality
  sleep(duration: number): Promise<void>;

  // Logging
  log(level: "info" | "warn" | "error", message: string, data?: unknown): void;
}

export interface ActivityOptions {
  timeout?: number;
  retryPolicy?: RetryPolicy;
  headers?: Record<string, string>;
}
```

## Exemplo de Uso

### JWT Authentication

```typescript
// Configurando JWT engine
const keyManager = new DefaultKeyManager(
  "https://auth.example.com/.well-known/jwks.json",
);
const jwtEngine = new DefaultJWTEngine(keyManager, [
  "https://auth.example.com",
]);

// Verificando token
try {
  const payload = await jwtEngine.verify(token, {
    audience: "deco-api",
    issuer: "https://auth.example.com",
  });

  console.log("User authenticated:", payload.sub);
} catch (error) {
  console.error("Authentication failed:", error);
}

// Criando token
const token = await jwtEngine.sign(
  { sub: "user123", role: "admin" },
  {
    expiresIn: 3600, // 1 hour
    audience: "deco-api",
    issuer: "https://auth.example.com",
  },
);
```

### Workflow Execution

```typescript
// Inicializando workflows
await initOnce();

// Definindo um workflow
const workflow = async (ctx: WorkflowContext, input: { userId: string }) => {
  // Execute activity
  const userData = await ctx.executeActivity("getUserData", {
    userId: input.userId,
  });

  // Sleep
  await ctx.sleep(1000);

  // Execute another activity
  const result = await ctx.executeActivity("processUser", userData);

  return result;
};

// Executando workflow
const execution = await workflowClient.execute(workflow, {
  userId: "user123",
});
```

O diretório commons fornece funcionalidades essenciais que são utilizadas em
todo o framework deco, garantindo segurança através de JWT e permitindo
workflows duráveis para operações complexas.
