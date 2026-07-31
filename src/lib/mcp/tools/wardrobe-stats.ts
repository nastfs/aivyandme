import { defineTool } from "@lovable.dev/mcp-js";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "wardrobe_stats",
  title: "Kleiderschrank-Statistik",
  description: "Zählt die Kleidungsstücke pro Kategorie sowie die Gesamtzahl im Kleiderschrank.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase.from("wardrobe_items").select("category");
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const byCategory: Record<string, number> = {};
    for (const row of data ?? []) {
      byCategory[row.category] = (byCategory[row.category] ?? 0) + 1;
    }
    const result = { total: data?.length ?? 0, byCategory };
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: result,
    };
  },
});