import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

const CATEGORIES = [
  "oberteile","hosen","kleider","blazer","roecke","schuhe","taschen","accessoires","sport","sonstiges",
] as const;

export default defineTool({
  name: "list_wardrobe_items",
  title: "Kleiderschrank auflisten",
  description:
    "Listet die Kleidungsstücke im digitalen Kleiderschrank der angemeldeten Person, optional nach Kategorie gefiltert.",
  inputSchema: {
    category: z.enum(CATEGORIES).optional().describe("Optionaler Kategoriefilter."),
    limit: z.number().int().min(1).max(200).default(50).describe("Maximale Anzahl Teile."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ category, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("wardrobe_items")
      .select("id,name,category,color,notes,created_at")
      .order("created_at", { ascending: false })
      .limit(limit ?? 50);
    if (category) query = query.eq("category", category);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { items: data ?? [] },
    };
  },
});