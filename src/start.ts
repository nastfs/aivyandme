import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

/** Supabase auth middleware needs WebSocket; Node 20 has none — polyfill only on server. */
const nodeWebSocketPolyfill = createMiddleware({ type: "function" }).server(async ({ next }) => {
  if (typeof (globalThis as { WebSocket?: unknown }).WebSocket === "undefined") {
    const { WebSocket } = await import("ws");
    (globalThis as { WebSocket: unknown }).WebSocket = WebSocket;
  }
  return next();
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  functionMiddleware: [nodeWebSocketPolyfill, attachSupabaseAuth],
  requestMiddleware: [errorMiddleware, csrfMiddleware],
}));
