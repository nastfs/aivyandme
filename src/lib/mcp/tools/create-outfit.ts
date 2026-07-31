import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "create_outfit",
  title: "Outfit erstellen",
  description:
    "Erstellt ein neues Outfit aus vorhandenen Kleidungsstücken (IDs aus list_wardrobe_items) und plant es optional auf ein Datum.",
  inputSchema: {
    name: z.string().trim().min(1).max(80).describe("Name des Outfits."),
    itemIds: z.array(z.string().uuid()).min(1).max(20).describe("IDs der Kleidungsstücke."),
    notes: z.string().trim().max(500).optional().describe("Optionale Notiz."),
    plannedDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("Optionales Datum (YYYY-MM-DD), auf das das Outfit geplant wird."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ name, itemIds, notes, plannedDate }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const userId = ctx.getUserId();
    if (!userId) return notAuthenticated();
    const supabase = supabaseForUser(ctx);

    const { data: outfit, error } = await supabase
      .from("outfits")
      .insert({ user_id: userId, name, notes: notes ?? null })
      .select("id,name")
      .single();
    if (error) throw new ToolError(error.message);

    const { error: linkError } = await supabase
      .from("outfit_items")
      .insert(itemIds.map((item_id) => ({ outfit_id: outfit.id, item_id })));
    if (linkError) throw new ToolError(linkError.message);

    if (plannedDate) {
      const { error: planError } = await supabase
        .from("outfit_plans")
        .insert({ user_id: userId, outfit_id: outfit.id, planned_date: plannedDate });
      if (planError) throw new ToolError(planError.message);
    }

    const result = { id: outfit.id, name: outfit.name, itemCount: itemIds.length, plannedDate: plannedDate ?? null };
    return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
  },
});