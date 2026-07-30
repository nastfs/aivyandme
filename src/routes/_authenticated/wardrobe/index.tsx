import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { signedUrlsMap } from "@/lib/storage";
import { CATEGORIES, categoryLabel, type CategoryValue } from "@/lib/categories";
import { Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/wardrobe/")({
  component: Wardrobe,
  head: () => ({
    meta: [
      { title: "Kleiderschrank — Aivy & Me" },
      { name: "description", content: "Alle deine Teile, sortiert nach Kategorie." },
    ],
  }),
});

function Wardrobe() {
  const [active, setActive] = useState<"all" | CategoryValue>("all");

  const { data } = useQuery({
    queryKey: ["wardrobe-items"],
    queryFn: async () => {
      const { data: items, error } = await supabase
        .from("wardrobe_items")
        .select("id, image_url, category, name, color, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const urls = await signedUrlsMap((items ?? []).map((i) => i.image_url));
      return { items: items ?? [], urls };
    },
  });

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
        <h1 className="text-4xl">Mein Kleiderschrank</h1>
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
        <Chip active={active === "all"} onClick={() => setActive("all")} label="Alle" />
        {CATEGORIES.filter((c) => c.value !== "sonstiges").map((c) => (
          <Chip
            key={c.value}
            active={active === c.value}
            onClick={() => setActive(c.value)}
            label={c.label}
          />
        ))}
      </div>

      {data?.items && data.items.length === 0 ? (
        <div className="mt-16 rounded-3xl bg-card p-8 text-center shadow-sm">
          <p className="text-lg">Dein Schrank ist noch leer</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Fotografiere dein erstes Teil — die KI kümmert sich um den Rest.
          </p>
          <Link
            to="/wardrobe/add"
            className="mt-6 inline-flex rounded-full bg-primary px-6 py-2.5 text-sm text-primary-foreground"
          >
            Erstes Teil hinzufügen
          </Link>
        </div>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted-foreground">
            {active === "all"
              ? `${data?.items.length ?? 0} Teile`
              : `${counts[active] ?? 0} Teile in ${categoryLabel(active)}`}
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
                  {data?.urls[it.image_url] && (
                    <img src={data.urls[it.image_url]} alt={it.name ?? ""} className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="p-3">
                  <p className="truncate text-sm font-medium">{it.name || categoryLabel(it.category)}</p>
                  <p className="text-xs text-muted-foreground">
                    {categoryLabel(it.category)}{it.color ? ` · ${it.color}` : ""}
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