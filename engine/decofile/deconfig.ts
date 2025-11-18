import type { Fs } from "./fsFolder.ts";

export const Deconfig = {
  canParse: (uri?: string) => {
    return uri?.startsWith("deconfig://");
  },
  parseUri: (uri: string) => {
    // the format is deconfig://<project-url>@<branch>:<token>
    const [, url] = uri.split("://");
    const [projectUrl, branchToken] = url.split("@");
    const [branch, token] = branchToken.split(":");
    return {
      projectUrl: `${
        projectUrl.includes("localhost") ? "http" : "https"
      }://${projectUrl}`,
      branch,
      token,
    };
  },
};
export interface ReadFileOptions {
  path: string;
  branch?: string;
  format?: "base64" | "byteArray" | "plainString" | "json";
}

export interface ListFilesOptions {
  branch?: string;
  prefix?: string;
  includeContent?: boolean;
}

export interface PutFileOptions {
  branch?: string;
  path: string;
  content: string;
}

export interface DeconfigClient {
  READ_FILE: (
    path: ReadFileOptions,
  ) => Promise<{ content: string; address: string }>;
  LIST_FILES: (
    options: ListFilesOptions,
  ) => Promise<
    { files: Record<string, { content?: string; address: string }> }
  >;
  PUT_FILE: (options: PutFileOptions) => Promise<void>;
}

export interface DeconfigClientOptions {
  projectUrl: string;
  token: string;
  branch?: string;
}

export const toAsyncIterator = <T>(emitter: EventSource): AsyncIterable<T> => {
  const queue: T[] = [];
  let done = false;
  let waitPromise: ((data?: T) => void) | null = null;

  const triggerLoop = () => {
    if (waitPromise) {
      waitPromise();
      waitPromise = null;
    }
  };

  emitter.addEventListener("change", (data) => {
    queue.push(JSON.parse(data.data));
    triggerLoop();
  });

  emitter.addEventListener("error", () => {
    done = true;
    triggerLoop();
  });

  return {
    async *[Symbol.asyncIterator]() {
      while (true) {
        const value = queue.shift();
        if (value) {
          yield value;
        } else {
          if (done) return;
          await new Promise((resolve) => (waitPromise = resolve));
        }
      }
    },
  };
};

const createClient = (
  options: DeconfigClientOptions,
): {
  client: DeconfigClient;
  watcher: (
    options: { pathFilter: string; branch?: string },
  ) => AsyncIterable<{ path: string; metadata: { address: string } }>;
} => {
  const callTool = async (tool: string, args: Record<string, unknown>) => {
    const response = await fetch(
      `${options.projectUrl}/i:deconfig-management/tools/call/${tool}`,
      {
        method: "POST",
        body: JSON.stringify(args),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${options.token}`,
          "x-deco-branch": options.branch ?? "main",
        },
      },
    );
    if (!response.ok) {
      throw new Error(response.statusText);
    }
    const responseJson = await response.json() as {
      structuredContent: unknown;
    };
    return responseJson.structuredContent;
  };
  return {
    client: new Proxy<DeconfigClient>({} as DeconfigClient, {
      get: (_, prop) => {
        return (args: Record<string, unknown>) => {
          return callTool(prop as string, args);
        };
      },
    }) as DeconfigClient,
    watcher: (watchOptions) => {
      const url = new URL(`${options.projectUrl}/deconfig/watch`);
      url.searchParams.set("pathFilter", watchOptions.pathFilter);
      url.searchParams.set("branch", watchOptions.branch ?? "main");
      url.searchParams.set("auth-token", options.token);
      url.searchParams.set("fromCtime", "1");
      const eventSource = new EventSource(url);
      return toAsyncIterator<{ path: string; metadata: { address: string } }>(
        eventSource,
      );
    },
  };
};

export const deconfigFs = (uri: string): Fs => {
  const options = Deconfig.parseUri(uri);
  const { client, watcher } = createClient(options);
  const state: Record<string, { content: string; address: string }> = {};
  return {
    cwd: () => "/",
    ensureFile: () => Promise.resolve(),
    readDir: async function* (path: string) {
      const { files } = await client.LIST_FILES({
        prefix: path,
        branch: options.branch,
        includeContent: true,
      });
      for (const [filePath, { content }] of Object.entries(files)) {
        if (content) {
          state[filePath] = {
            content: atob(content),
            address: files[filePath].address,
          };
        }
        yield filePath.replace(`${path}/`, "");
      }
    },
    readTextFile: async (path: string) => {
      const { content } = state[path] ?? await client.READ_FILE({
        path,
        branch: options.branch,
        format: "plainString",
      });
      return content;
    },
    writeTextFile: async (path: string, content: string) => {
      await client.PUT_FILE({ path, content, branch: options.branch });
    },
    watchFs: async function* (path: string) {
      for await (
        const event of watcher({ pathFilter: path, branch: options.branch })
      ) {
        if (
          state[event.path] &&
          state[event.path].address !== event.metadata.address
        ) {
          delete state[event.path];
        }
        yield { paths: [event.path] };
      }
    },
  };
};
