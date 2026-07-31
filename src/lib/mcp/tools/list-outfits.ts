import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_outfits",
  title: "Outfits auflisten",
  description: "Listet die gespeicherten Outfits inklusive der enthaltenen Kleidungsstücke.",
  inputSchema: { limit: z.number().int().min(1).max(100).default(30).describe("Maximale Anzahl Outfits.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("outfits")
      .select("id,name,notes,created_at,outfit_items(item_id,wardrobe_items(id,name,category,color))")
      .order("created_at", { ascending: false })
      .limit(limit ?? 30);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { outfits: data ?? [] },
    };
  },
});