import type { ComponentChildren, ComponentType } from "preact";
import { type AppManifest, Context } from "../../mod.ts";
import { Hono, upgradeWebSocket } from "../deps.ts";
import type { Bindings } from "../handler.tsx";
import type { DecoRouteState } from "../middleware.ts";
import { factory } from "./Renderer.tsx";

const DEV_SERVER_PATH = `/deco/dev`;
const DEV_SERVER_SCRIPT = (
  <script
    dangerouslySetInnerHTML={{
      __html: `
// Debounce function to limit the rate of page refreshes
function debounce(func, delay) {
let timeoutId;
return function(...args) {
if (timeoutId) clearTimeout(timeoutId);
timeoutId = setTimeout(() => func.apply(null, args), delay);
};
}

// Function to refresh the page
function refreshPage() {
window.location.reload();
}

// Debounced version of refreshPage
const debouncedRefresh = debounce(refreshPage, 100);

// Function to set up the WebSocket and listen for messages
function setupWebSocket() {
// Construct WebSocket URL based on current domain and protocol
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const host = window.location.host;
const path = '${DEV_SERVER_PATH}';
const wsUrl = \`\${protocol}//\${host}\${path}\`;

// Create a WebSocket connection
const socket = new WebSocket(wsUrl);

// Add an event listener for messages
socket.addEventListener('message', function(event) {
// Call the debounced function to refresh the page
debouncedRefresh();
});

// Handle errors
socket.addEventListener('error', function(error) {
console.error('WebSocket Error:', error);
});

// Clean up the WebSocket connection when the page is unloaded
window.addEventListener('beforeunload', function() {
socket.close();
});
}

// Run the setup function when the page loads
window.onload = setupWebSocket;
`,
    }}
  >
  </script>
);
let hmrUniqueId = crypto.randomUUID();
const sockets = new Map<string, WebSocket>();

export interface HTMXOpts {
  Layout?: ComponentType<
    {
      req: Request;
      hmrUniqueId: string;
      revision: string;
      children: ComponentChildren;
    }
  >;
}
export const HTMX = <
  TAppManifest extends AppManifest = AppManifest,
>(opts?: HTMXOpts): Bindings<TAppManifest> => {
  const hono = new Hono<DecoRouteState<TAppManifest>>();
  hono.get(
    DEV_SERVER_PATH,
    upgradeWebSocket(() => {
      const clientId = crypto.randomUUID();
      return {
        onOpen: (_, ws) => {
          sockets.set(clientId, ws.raw as WebSocket);
        },
        onClose: () => {
          sockets.delete(clientId);
        },
      };
    }),
  );
  const Layout = opts?.Layout ?? (({ children }) => <>{children}</>);
  return {
    server: hono,
    renderer: {
      factory,
      Layout: ({ children, req, revision }) => {
        const active = Context.active();
        return (
          <Layout req={req} hmrUniqueId={hmrUniqueId} revision={revision}>
            {!active.isDeploy ? DEV_SERVER_SCRIPT : null}
            {children}
          </Layout>
        );
      },
    },
  };
};

addEventListener("hmr", () => {
  hmrUniqueId = crypto.randomUUID();
  for (const socket of sockets.values()) {
    socket.send("refresh");
  }
});
