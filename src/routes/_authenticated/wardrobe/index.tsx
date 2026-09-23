import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { signedUrlsMap, displayPath } from "@/lib/storage";
import { smoothItemImage } from "@/lib/wardrobe.functions";
import { normalizeItemImages } from "@/lib/normalize-images";
import { CATEGORIES, categoryLabel, type CategoryValue } from "@/lib/categories";
import { Plus, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/wardrobe/")({
  component: Wardrobe,
  head: () => ({
    meta: [
      { title: "Wardrobe — Aivy & Me" },
      { name: "description", content: "All your items, sorted by category." },
    ],
  }),
});

function Wardrobe() {
  const { t, lang } = useLanguage();
  const [active, setActive] = useState<"all" | CategoryValue>("all");
  const qc = useQueryClient();
  const smooth = useServerFn(smoothItemImage);
  const [normalizing, setNormalizing] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const { data } = useQuery({
    queryKey: ["wardrobe-items"],
    queryFn: async () => {
      const { data: items, error } = await supabase
        .from("wardrobe_items")
        .select("id, image_url, ai_image_url, ai_image_url_2, use_ai_image, category, name, color, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const urls = await signedUrlsMap((items ?? []).map((i) => displayPath(i)));
      return { items: items ?? [], urls };
    },
  });

  const outdated = useMemo(
    () =>
      (data?.items ?? []).filter(
        (i) => !i.ai_image_url || (i.category === "schuhe" && !i.ai_image_url_2),
      ),
    [data],
  );

  async function normalizeAll() {
    if (!outdated.length) return;
    setNormalizing(true);
    setProgress({ done: 0, total: outdated.length });
    let failed = 0;
    for (const [i, item] of outdated.entries()) {
      try {
        await normalizeItemImages(
          { id: item.id, image_url: item.image_url, category: item.category },
          smooth as any,
        );
      } catch {
        failed++;
      }
      setProgress({ done: i + 1, total: outdated.length });
    }
    setNormalizing(false);
    qc.invalidateQueries();
    if (failed) toast.error(t("wardrobe.normalizeFailed", { count: failed }));
    else toast.success(t("wardrobe.normalizeSuccess"));
  }

  const filtered = useMemo(() => {
    if (!data?.items) return [];
    if (active === "all") return data.items;
    return data.items.filter((i) => i.category === active);
  }, [data, active]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    data?.items?.forEach((i) => { map[i.category] = (map[i.category] ?? 0) + 1; });
    return map;
  }, [data]);

  return (
    <div className="px-6 pt-10">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-4xl">{t("wardrobe.title")}</h1>
        <div className="flex items-center gap-2">
          <Link to="/wardrobe/add" className="rounded-full bg-primary p-2 text-primary-foreground">
            <Plus className="h-5 w-5" />
          </Link>
          <button className="rounded-full border border-border p-2">
            <Search className="h-5 w-5" strokeWidth={1.5} />
          </button>
        </div>
      </header>

      <div className="mb-6 flex gap-2 overflow-x-auto pb-2 -mx-6 px-6">
        <Chip active={active === "all"} onClick={() => setActive("all")} label={t("wardrobe.all")} />
        {CATEGORIES.filter((c) => c.value !== "sonstiges").map((c) => (
          <Chip
            key={c.value}
            active={active === c.value}
            onClick={() => setActive(c.value)}
            label={t(c.labelKey)}
          />
        ))}
      </div>

      {(outdated.length > 0 || normalizing) && (
        <div className="mb-5 rounded-3xl bg-card p-4 shadow-sm">
          <p className="text-sm">{t("wardrobe.normalizeImages")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {normalizing
              ? t("wardrobe.normalizingProgress", { done: progress.done, total: progress.total })
              : t("wardrobe.normalizeHint", { count: outdated.length })}
          </p>
          <button
            onClick={normalizeAll}
            disabled={normalizing}
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-60"
          >
            <Sparkles className="h-4 w-4" />
            {normalizing ? t("wardrobe.running") : t("wardrobe.normalizeNow")}
          </button>
        </div>
      )}

      {data?.items && data.items.length === 0 ? (
        <div className="mt-16 rounded-3xl bg-card p-8 text-center shadow-sm">
          <p className="text-lg">{t("wardrobe.noItems")}</p>
          <p className="mt-2 text-sm text-muted-foreground">{t("wardrobe.noItemsHint")}</p>
          <Link
            to="/wardrobe/add"
            className="mt-6 inline-flex rounded-full bg-primary px-6 py-2.5 text-sm text-primary-foreground"
          >
            {t("wardrobe.addFirstItem")}
          </Link>
        </div>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted-foreground">
            {active === "all"
              ? t("wardrobe.itemsCount", { count: data?.items.length ?? 0 })
              : t("wardrobe.itemsCountInCategory", { count: counts[active] ?? 0, category: categoryLabel(active, lang) })}
          </p>
          <div className="grid grid-cols-2 gap-3 pb-8">
            {filtered.map((it) => (
              <Link
                key={it.id}
                to="/wardrobe/$id"
                params={{ id: it.id }}
                className="block overflow-hidden rounded-2xl bg-card shadow-sm"
              >
                <div className="aspect-square bg-secondary">
                  {data?.urls[displayPath(it)] && (
                    <img src={data.urls[displayPath(it)]} alt={it.name ?? ""} className="h-full w-full object-contain" />
                  )}
                </div>
                <div className="p-3">
                  <p className="truncate text-sm font-medium">{it.name || categoryLabel(it.category, lang)}</p>
                  <p className="text-xs text-muted-foreground">
                    {categoryLabel(it.category, lang)}{it.color ? ` · ${it.color}` : ""}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-2xl border px-4 py-2 text-sm transition",
        active
          ? "border-primary bg-accent text-accent-foreground"
          : "border-border bg-card text-muted-foreground",
      )}
    >
      {label}
    </button>
  );
}