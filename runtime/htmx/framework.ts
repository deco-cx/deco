/** @jsxRuntime automatic */
/** @jsxImportSource preact */
import type { ComponentChildren, ComponentType } from "preact";
import {
  Fragment as _Fragment,
  jsx as _jsx,
  jsxs as _jsxs,
} from "preact/jsx-runtime";
import { Context } from "../../deco.ts";
import type { AppManifest } from "../../types.ts";
import { Hono, upgradeWebSocket } from "../deps.ts";
import type { Bindings } from "../handler.ts";
import type { DecoRouteState } from "../middleware.ts";
import framework from "./Bindings.ts";
import { renderFn } from "./Renderer.ts";
import { staticFiles } from "./serveStatic.ts";
const DEV_SERVER_PATH = `/deco/dev`;
const DEV_SERVER_SCRIPT = /*#__PURE__*/ _jsx("script", {
  dangerouslySetInnerHTML: {
    __html: `
if (!window.HAS_PREVIEW_SCRIPT) {
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
  window.HAS_PREVIEW_SCRIPT = true;
}
`,
  },
});
let hmrUniqueId = crypto.randomUUID();
const sockets = new Map<string, WebSocket>();

export interface HTMXOpts<TAppManifest extends AppManifest = AppManifest> {
  staticRoot?: string;
  server?: Hono<DecoRouteState<TAppManifest>>;
  Layout?: ComponentType<
    {
      hmrUniqueId: string;
      revision: string;
      children: ComponentChildren;
    }
  >;
}
export const HTMX = <
  TAppManifest extends AppManifest = AppManifest,
>(opts?: HTMXOpts<TAppManifest>): Bindings<TAppManifest> => {
  const hono = opts?.server ?? new Hono<DecoRouteState<TAppManifest>>();
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
  hono.use(staticFiles(opts?.staticRoot));
  const Layout = opts?.Layout ??
    (({ children }) =>
      /*#__PURE__*/ _jsx(_Fragment, {
        children: children,
      }));
  return {
    server: hono,
    framework,
    renderer: {
      renderFn: async ({ page }) => {
        const active = Context.active();
        const revision = await active.release?.revision();
        return renderFn({
          page: {
            metadata: page.metadata,
            Component: () => {
              // @ts-expect-error: i dont know why this is happening
              return /*#__PURE__*/ _jsxs(Layout, {
                hmrUniqueId: hmrUniqueId,
                revision: revision,
                children: [
                  !active.isDeploy ? DEV_SERVER_SCRIPT : null,
                  /*#__PURE__*/ _jsx(page.Component, {
                    ...page.props,
                  }),
                ],
              });
            },
            props: {},
          },
        });
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
