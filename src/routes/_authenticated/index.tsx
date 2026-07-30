import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { signedUrlsMap, displayPath } from "@/lib/storage";
import { categoryLabel } from "@/lib/categories";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Bell, Sun } from "lucide-react";

export const Route = createFileRoute("/_authenticated/")({
  component: Home,
  head: () => ({
    meta: [
      { title: "Home — Aivy & Me" },
      { name: "description", content: "Dein heutiger Look und dein Kleiderschrank auf einen Blick." },
    ],
  }),
});

function Home() {
  const { user } = Route.useRouteContext();
  const name =
    (user?.user_metadata as any)?.display_name ||
    user?.email?.split("@")[0] ||
    "Willkommen";

  const today = format(new Date(), "yyyy-MM-dd");

  const { data } = useQuery({
    queryKey: ["home"],
    queryFn: async () => {
      const [{ data: items }, { data: plan }, { data: recent }] = await Promise.all([
        supabase
          .from("wardrobe_items")
          .select("id, image_url, ai_image_url, use_ai_image, category")
          .order("created_at", { ascending: false })
          .limit(8),
        supabase
          .from("outfit_plans")
          .select("outfit_id, outfits(name, outfit_items(item_id, wardrobe_items(image_url, ai_image_url, use_ai_image)))")
          .eq("planned_date", today)
          .maybeSingle(),
        supabase
          .from("outfits")
          .select("id, name, outfit_items(wardrobe_items(image_url, ai_image_url, use_ai_image))")
          .order("created_at", { ascending: false })
          .limit(4),
      ]);
      const paths: string[] = [];
      items?.forEach((i) => i.image_url && paths.push(displayPath(i)));
      (plan as any)?.outfits?.outfit_items?.forEach((oi: any) =>
        oi.wardrobe_items && paths.push(displayPath(oi.wardrobe_items)),
      );
      recent?.forEach((o: any) =>
        o.outfit_items?.forEach((oi: any) => oi.wardrobe_items && paths.push(displayPath(oi.wardrobe_items))),
      );
      const urls = await signedUrlsMap(paths);
      return { items: items ?? [], plan, recent: recent ?? [], urls };
    },
  });

  return (
    <div className="px-6 pt-10">
      <header className="mb-8 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-4xl leading-tight">
            <span className="font-serif">Guten Tag, {name}</span>
            <Sun className="h-6 w-6 text-accent-foreground" strokeWidth={1.5} />
          </div>
          <p className="mt-3 text-sm text-primary/70">Heutige Empfehlung</p>
          <p className="text-lg">Bereit für einen stilvollen Tag?</p>
        </div>
        <button className="rounded-full border border-border p-2">
          <Bell className="h-5 w-5" strokeWidth={1.5} />
        </button>
      </header>

      {(data?.plan as any)?.outfits && (
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl">Dein Outfit für heute</h2>
            <span className="text-xs text-muted-foreground">
              {format(new Date(), "EEEE, d. MMMM", { locale: de })}
            </span>
          </div>
          <div className="rounded-3xl bg-card p-4 shadow-sm">
            <p className="mb-3 font-medium">{(data?.plan as any).outfits.name}</p>
            <div className="flex gap-2 overflow-x-auto">
              {(data?.plan as any).outfits.outfit_items?.map((oi: any, i: number) => (
                <img
                  key={i}
                  src={data?.urls[oi.wardrobe_items ? displayPath(oi.wardrobe_items) : ""] ?? ""}
                  className="h-24 w-24 rounded-2xl bg-secondary object-cover"
                  alt=""
                />
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl">Mein Kleiderschrank</h2>
          <Link to="/wardrobe" className="text-sm text-primary">
            Alle anzeigen ›
          </Link>
        </div>
        {data?.items?.length ? (
          <div className="grid grid-cols-2 gap-3">
            {data.items.slice(0, 4).map((it) => (
              <Link
                key={it.id}
                to="/wardrobe"
                className="overflow-hidden rounded-2xl bg-secondary"
              >
                <div className="aspect-square bg-secondary">
                  {data.urls[displayPath(it)] && (
                    <img src={data.urls[displayPath(it)]} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="p-2 text-center text-sm">{categoryLabel(it.category)}</div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyCard
            title="Noch keine Teile"
            hint="Füge dein erstes Kleidungsstück hinzu — die KI erkennt automatisch, was es ist."
            ctaTo="/wardrobe/add"
            ctaLabel="Teil hinzufügen"
          />
        )}
      </section>

      {data?.recent?.length ? (
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl">Zuletzt zusammengestellt</h2>
            <Link to="/outfits" className="text-sm text-primary">
              Alle anzeigen ›
            </Link>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {data.recent.map((o: any) => (
              <Link
                key={o.id}
                to="/outfits"
                className="w-40 shrink-0 rounded-2xl bg-secondary p-3"
              >
                <div className="grid grid-cols-2 gap-1">
                  {o.outfit_items?.slice(0, 4).map((oi: any, i: number) => (
                    <div key={i} className="aspect-square overflow-hidden rounded-md bg-card">
                      {oi.wardrobe_items && data.urls[displayPath(oi.wardrobe_items)] && (
                        <img src={data.urls[displayPath(oi.wardrobe_items)]} className="h-full w-full object-cover" alt="" />
                      )}
                    </div>
                  ))}
                </div>
                <p className="mt-2 truncate text-sm">{o.name}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function EmptyCard({
  title, hint, ctaTo, ctaLabel,
}: { title: string; hint: string; ctaTo: string; ctaLabel: string }) {
  return (
    <div className="rounded-3xl bg-card p-6 text-center shadow-sm">
      <h3 className="text-lg">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{hint}</p>
      <Link
        to={ctaTo}
        className="mt-4 inline-flex rounded-full bg-primary px-5 py-2 text-sm text-primary-foreground"
      >
        {ctaLabel}
      </Link>
    </div>
  );
}