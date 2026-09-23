import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { signedUrlsMap, displayPath } from "@/lib/storage";
import { categoryLabel } from "@/lib/categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/lib/i18n";

const searchSchema = z.object({ date: z.string().optional() });

export const Route = createFileRoute("/_authenticated/outfits/new")({
  validateSearch: (s) => searchSchema.parse(s),
  component: NewOutfit,
  head: () => ({
    meta: [{ title: "New Look — Aivy & Me" }],
  }),
});

function NewOutfit() {
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const search = Route.useSearch();
  const [name, setName] = useState("");
  const [date, setDate] = useState<string>(search.date ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const { data } = useQuery({
    queryKey: ["all-items"],
    queryFn: async () => {
      const { data: items } = await supabase
        .from("wardrobe_items")
        .select("id, image_url, ai_image_url, use_ai_image, category, name")
        .order("category");
      const urls = await signedUrlsMap((items ?? []).map((i) => displayPath(i)));
      return { items: items ?? [], urls };
    },
  });

  const grouped =
    data?.items?.reduce<Record<string, typeof data.items>>((acc, it) => {
      (acc[it.category] ||= []).push(it);
      return acc;
    }, {}) ?? {};

  function toggle(id: string) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  }

  async function save() {
    if (!name.trim()) return toast.error(t("outfitNew.nameRequired"));
    if (selected.size === 0) return toast.error(t("outfitNew.selectAtLeastOne"));
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user!.id;
      const { data: outfit, error } = await supabase
        .from("outfits")
        .insert({ user_id: uid, name: name.trim() })
        .select("id")
        .single();
      if (error) throw error;
      const rows = Array.from(selected).map((item_id) => ({ outfit_id: outfit.id, item_id }));
      const { error: e2 } = await supabase.from("outfit_items").insert(rows);
      if (e2) throw e2;
      if (date) {
        const { error: e3 } = await supabase
          .from("outfit_plans")
          .upsert({ user_id: uid, outfit_id: outfit.id, planned_date: date }, { onConflict: "user_id,planned_date" });
        if (e3) throw e3;
      }
      toast.success(t("outfitNew.saved"));
      qc.invalidateQueries();
      navigate({ to: "/outfits" });
    } catch (e: any) {
      toast.error(e.message ?? t("outfitNew.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-6 pt-10 pb-8">
      <header className="mb-6 flex items-center justify-between">
        <Link to="/outfits" className="rounded-full border border-border p-2">
          <X className="h-5 w-5" strokeWidth={1.5} />
        </Link>
        <h1 className="text-xl">{t("outfitNew.title")}</h1>
        <div className="w-9" />
      </header>

      <div className="mb-4 space-y-3 rounded-3xl bg-card p-4 shadow-sm">
        <div className="space-y-2">
          <Label htmlFor="name">{t("item.name")}</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("outfitNew.namePlaceholder")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="date">{t("outfitNew.planDate")}</Label>
          <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      <p className="mb-3 text-sm text-muted-foreground">
        {t("outfitNew.itemsChosen", { count: selected.size })}
      </p>

      {data?.items?.length === 0 ? (
        <div className="rounded-3xl bg-card p-6 text-center text-sm text-muted-foreground shadow-sm">
          {t("outfitNew.emptyWardrobe")}
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat}>
              <p className="mb-2 text-sm font-medium">{categoryLabel(cat, lang)}</p>
              <div className="grid grid-cols-3 gap-2">
                {items!.map((it) => {
                  const on = selected.has(it.id);
                  return (
                    <button
                      key={it.id}
                      onClick={() => toggle(it.id)}
                      className={cn(
                        "relative aspect-square overflow-hidden rounded-2xl border-2 bg-card",
                        on ? "border-primary" : "border-transparent",
                      )}
                    >
                      {data?.urls[displayPath(it)] && (
                        <img src={data.urls[displayPath(it)]} alt={it.name ?? ""} className="h-full w-full object-cover" />
                      )}
                      {on && (
                        <div className="absolute right-1 top-1 rounded-full bg-primary p-1 text-primary-foreground">
                          <Check className="h-3 w-3" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="sticky bottom-24 mt-8">
        <Button onClick={save} disabled={saving} className="w-full">
          {saving ? t("outfitNew.saving") : t("outfitNew.save")}
        </Button>
      </div>
    </div>
  );
}