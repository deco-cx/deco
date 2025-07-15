# Outros Diretórios

Esta documentação cobre os diretórios menores mas importantes do framework deco:
clients, components, hooks e plugins.

## Clients (`clients/`)

O diretório `clients/` contém implementações de clientes HTTP e utilitários de
rede.

### Estrutura

```
clients/
├── formdata.ts            # Manipulação de form data
├── formdata.test.ts       # Testes de form data
├── proxy.ts               # Cliente HTTP proxy
└── withManifest.ts        # Integração com manifests
```

### Form Data (`formdata.ts`)

```typescript
export const parseFormData = async (
  request: Request,
): Promise<Record<string, any>> => {
  const contentType = request.headers.get("content-type");

  if (contentType?.includes("application/x-www-form-urlencoded")) {
    const text = await request.text();
    return parseUrlEncoded(text);
  }

  if (contentType?.includes("multipart/form-data")) {
    const formData = await request.formData();
    return parseMultipart(formData);
  }

  return {};
};

export const parseUrlEncoded = (text: string): Record<string, any> => {
  const params = new URLSearchParams(text);
  const result: Record<string, any> = {};

  for (const [key, value] of params) {
    result[key] = value;
  }

  return result;
};

export const parseMultipart = (formData: FormData): Record<string, any> => {
  const result: Record<string, any> = {};

  for (const [key, value] of formData) {
    if (value instanceof File) {
      result[key] = {
        name: value.name,
        size: value.size,
        type: value.type,
        content: value,
      };
    } else {
      result[key] = value;
    }
  }

  return result;
};
```

### Proxy Client (`proxy.ts`)

```typescript
export class ProxyClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(baseUrl: string, headers: Record<string, string> = {}) {
    this.baseUrl = baseUrl;
    this.headers = headers;
  }

  async request(
    path: string,
    options: RequestInit = {},
  ): Promise<Response> {
    const url = new URL(path, this.baseUrl);

    const response = await fetch(url.toString(), {
      ...options,
      headers: {
        ...this.headers,
        ...options.headers,
      },
    });

    return response;
  }

  async get(path: string, options?: RequestInit): Promise<Response> {
    return this.request(path, { ...options, method: "GET" });
  }

  async post(
    path: string,
    body: any,
    options?: RequestInit,
  ): Promise<Response> {
    return this.request(path, {
      ...options,
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json", ...options?.headers },
    });
  }
}
```

## Components (`components/`)

O diretório `components/` contém componentes React/Preact reutilizáveis.

### Estrutura

```
components/
├── JsonViewer.tsx         # Visualizador de JSON
├── LiveControls.tsx       # Controles em tempo real
├── PreviewNotAvailable.tsx # Componente de preview indisponível
├── section.tsx            # Componente base de seção
└── StubSection.tsx        # Seção placeholder
```

### JsonViewer (`JsonViewer.tsx`)

```tsx
export interface JsonViewerProps {
  body: string;
  collapsed?: boolean;
  theme?: "light" | "dark";
}

export default function JsonViewer({
  body,
  collapsed = false,
  theme = "light",
}: JsonViewerProps) {
  const [isCollapsed, setIsCollapsed] = useState(collapsed);

  let parsedJson;
  try {
    parsedJson = JSON.parse(body);
  } catch {
    return <pre className="text-red-500">Invalid JSON</pre>;
  }

  return (
    <div className={`json-viewer ${theme}`}>
      <div className="json-viewer-header">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="toggle-button"
        >
          {isCollapsed ? "▶" : "▼"}
        </button>
        <span>JSON</span>
      </div>
      {!isCollapsed && (
        <pre className="json-content">
          {JSON.stringify(parsedJson, null, 2)}
        </pre>
      )}
    </div>
  );
}
```

### Section Component (`section.tsx`)

```tsx
export interface SectionProps {
  Component: ComponentType<any>;
  props: any;
  metadata?: {
    resolveChain: string[];
    component: string;
  };
}

export default function Section({ Component, props, metadata }: SectionProps) {
  const ErrorFallback = ({ error, resetErrorBoundary }) => (
    <div className="error-boundary">
      <h2>Something went wrong:</h2>
      <pre>{error.message}</pre>
      <button onClick={resetErrorBoundary}>Try again</button>
    </div>
  );

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <div data-section={metadata?.component}>
        <Component {...props} />
      </div>
    </ErrorBoundary>
  );
}
```

## Hooks (`hooks/`)

O diretório `hooks/` contém hooks React/Preact customizados.

### Estrutura

```
hooks/
├── mod.ts                 # Exportações principais
├── useDevice.ts           # Hook para detecção de dispositivo
├── usePartialSection.ts   # Hook para renderização parcial
├── useScript.ts           # Hook para scripts
└── useSection.ts          # Hook para seções
```

### useDevice (`useDevice.ts`)

```typescript
export const useDevice = (): Device => {
  const [device, setDevice] = useState<Device>({ type: "desktop" });

  useEffect(() => {
    const userAgent = navigator.userAgent;
    const detectedDevice = detectDevice(userAgent);
    setDevice(detectedDevice);
  }, []);

  return device;
};

const detectDevice = (userAgent: string): Device => {
  if (/Mobile|Android|iP(hone|od|ad)/i.test(userAgent)) {
    return { type: "mobile" };
  }

  if (/Tablet|iPad/i.test(userAgent)) {
    return { type: "tablet" };
  }

  return { type: "desktop" };
};
```

### usePartialSection (`usePartialSection.ts`)

```typescript
export const usePartialSection = (sectionId: string) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const reloadSection = async (props?: any) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/deco/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: sectionId,
          props,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();

      // Update DOM
      const element = document.querySelector(`[data-section="${sectionId}"]`);
      if (element) {
        element.innerHTML = html;
      }
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  };

  return { reloadSection, isLoading, error };
};
```

### useScript (`useScript.ts`)

```typescript
export const useScript = (src: string, options: UseScriptOptions = {}) => {
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  useEffect(() => {
    if (!src) return;

    const script = document.createElement("script");
    script.src = src;
    script.async = options.async !== false;
    script.defer = options.defer === true;

    script.onload = () => setStatus("ready");
    script.onerror = () => setStatus("error");

    document.head.appendChild(script);

    return () => {
      document.head.removeChild(script);
    };
  }, [src, options.async, options.defer]);

  return status;
};

export interface UseScriptOptions {
  async?: boolean;
  defer?: boolean;
}
```

## Plugins (`plugins/`)

O diretório `plugins/` contém plugins para diferentes frameworks.

### Estrutura

```
plugins/
├── deco.ts                # Plugin principal do deco
├── fresh.ts               # Plugin para Fresh
└── styles.ts              # Plugin para estilos
```

### Fresh Plugin (`fresh.ts`)

```typescript
export const freshPlugin = (config: FreshConfig): Plugin => {
  return {
    name: "deco-fresh",
    setup(build) {
      build.onLoad({ filter: /\.tsx?$/ }, async (args) => {
        const content = await Deno.readTextFile(args.path);

        // Transform deco blocks
        const transformed = transformDecoBlocks(content);

        return {
          contents: transformed,
          loader: "tsx",
        };
      });
    },
  };
};

const transformDecoBlocks = (content: string): string => {
  // Transform block imports
  return content.replace(
    /from\s+['"]deco\/blocks\/(.+)['"]/g,
    'from "@deco/deco/blocks/$1"',
  );
};
```

### Styles Plugin (`styles.ts`)

```typescript
export const stylesPlugin = (config: StylesConfig): Plugin => {
  return {
    name: "deco-styles",
    setup(build) {
      build.onLoad({ filter: /\.css$/ }, async (args) => {
        const content = await Deno.readTextFile(args.path);

        // Process with Tailwind if enabled
        if (config.tailwind) {
          const processed = await processTailwind(content);
          return {
            contents: processed,
            loader: "css",
          };
        }

        return {
          contents: content,
          loader: "css",
        };
      });
    },
  };
};

const processTailwind = async (css: string): Promise<string> => {
  // Tailwind processing logic
  return css;
};
```

## Exemplo de Uso Integrado

```typescript
// Usando hooks em um componente
function MyComponent() {
  const device = useDevice();
  const script = useScript("https://cdn.example.com/lib.js");
  const { reloadSection, isLoading } = usePartialSection("product-shelf");

  if (device.type === "mobile") {
    return <MobileView onReload={reloadSection} />;
  }

  return <DesktopView isLoading={isLoading} />;
}

// Usando clients
const proxyClient = new ProxyClient("https://api.example.com");
const products = await proxyClient.get("/products");

// Usando plugins
const config = {
  plugins: [
    decoPlugin(),
    freshPlugin({ islands: true }),
    stylesPlugin({ tailwind: true }),
  ],
};
```

Estes diretórios fornecem funcionalidades essenciais de suporte ao framework
deco, incluindo clientes HTTP, componentes reutilizáveis, hooks personalizados e
plugins para diferentes frameworks.
