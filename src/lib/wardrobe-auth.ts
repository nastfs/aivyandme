import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Ensure Node 20 has WebSocket before Supabase auth client initializes. */
export const ensureNodeWebSocket = createMiddleware({ type: "function" }).server(async ({ next }) => {
  if (typeof (globalThis as { WebSocket?: unknown }).WebSocket === "undefined") {
    const { WebSocket } = await import("ws");
    (globalThis as { WebSocket: unknown }).WebSocket = WebSocket;
  }
  return next();
});

/** Auth gate for wardrobe AI server functions (WebSocket polyfill + Supabase). */
export const wardrobeAuth = [ensureNodeWebSocket, requireSupabaseAuth] as const;
