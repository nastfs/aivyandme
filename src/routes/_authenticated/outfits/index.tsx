import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { addDays, format, isSameDay, startOfWeek } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { signedUrlsMap, displayPath } from "@/lib/storage";
import { Plus, Trash2, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useLanguage } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/outfits/")({
  component: Outfits,
  head: () => ({
    meta: [
      { title: "Outfits — Aivy & Me" },
      { name: "description", content: "Your looks. Planned, saved, and always fitting." },
    ],
  }),
});

function Outfits() {
  const { t, lang } = useLanguage();
  const dateLocale = lang === "de" ? de : enUS;
  const qc = useQueryClient();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const { data } = useQuery({
    queryKey: ["outfits-page"],
    queryFn: async () => {
      const [{ data: outfits }, { data: plans }] = await Promise.all([
        supabase
          .from("outfits")
          .select("id, name, created_at, outfit_items(wardrobe_items(image_url, ai_image_url, use_ai_image))")
          .order("created_at", { ascending: false }),
        supabase
          .from("outfit_plans")
          .select("id, planned_date, outfit_id, outfits(name, outfit_items(wardrobe_items(image_url, ai_image_url, use_ai_image)))"),
      ]);
      const paths: string[] = [];
      outfits?.forEach((o: any) =>
        o.outfit_items?.forEach((oi: any) => oi.wardrobe_items && paths.push(displayPath(oi.wardrobe_items))),
      );
      plans?.forEach((p: any) =>
        p.outfits?.outfit_items?.forEach((oi: any) => oi.wardrobe_items && paths.push(displayPath(oi.wardrobe_items))),
      );
      const urls = await signedUrlsMap(paths);
      return { outfits: outfits ?? [], plans: plans ?? [], urls };
    },
  });

  const planByDay = useMemo(() => {
    const map: Record<string, any> = {};
    data?.plans?.forEach((p: any) => { map[p.planned_date] = p; });
    return map;
  }, [data]);

  const selectedKey = format(selectedDate, "yyyy-MM-dd");
  const selectedPlan = planByDay[selectedKey];

  async function removePlan(id: string) {
    const { error } = await supabase.from("outfit_plans").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(t("outfits.planRemoved"));
    qc.invalidateQueries({ queryKey: ["outfits-page"] });
    qc.invalidateQueries({ queryKey: ["home"] });
  }

  return (
    <div className="px-6 pt-10">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-4xl">{t("outfits.title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("outfits.tagline")}</p>
        </div>
        <Link to="/outfits/new" className="rounded-full bg-primary p-2 text-primary-foreground">
          <Plus className="h-5 w-5" />
        </Link>
      </header>

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl">{t("outfits.thisWeek")}</h2>
          <Popover>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-1 text-sm text-primary">
                <CalendarDays className="h-4 w-4" /> {t("outfits.calendar")}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto p-0">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => d && setSelectedDate(d)}
                modifiers={{ planned: Object.keys(planByDay).map((k) => new Date(k)) }}
                modifiersClassNames={{ planned: "bg-accent text-accent-foreground rounded-full" }}
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 -mx-6 px-6">
          {weekDays.map((d) => {
            const key = format(d, "yyyy-MM-dd");
            const plan = planByDay[key];
            const isSelected = isSameDay(d, selectedDate);
            return (
              <button
                key={key}
                onClick={() => setSelectedDate(d)}
                className={cn(
                  "flex w-24 shrink-0 flex-col items-center gap-2 rounded-2xl border p-2 text-center transition",
                  isSelected ? "border-primary bg-card shadow-sm" : "border-transparent bg-card",
                )}
              >
                <div className="text-xs text-muted-foreground">{format(d, "EEE", { locale: dateLocale })}</div>
                <div className="text-lg font-medium">{format(d, "d")}</div>
                <div className="aspect-square w-full overflow-hidden rounded-xl bg-secondary">
                  {plan ? (
                    <div className="grid h-full grid-cols-2 gap-0.5 p-1">
                      {plan.outfits?.outfit_items?.slice(0, 4).map((oi: any, i: number) => (
                        <div key={i} className="overflow-hidden rounded-sm bg-card">
                          {oi.wardrobe_items && data?.urls[displayPath(oi.wardrobe_items)] && (
                            <img src={data.urls[displayPath(oi.wardrobe_items)]} className="h-full w-full object-cover" alt="" />
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                      —
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-4 rounded-3xl bg-card p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium">
              {format(selectedDate, "EEEE, d. MMMM", { locale: dateLocale })}
            </p>
            {selectedPlan && (
              <button onClick={() => removePlan(selectedPlan.id)} className="text-muted-foreground">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
          {selectedPlan ? (
            <p className="text-lg">{selectedPlan.outfits?.name}</p>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{t("outfits.noPlanYet")}</p>
              <Link to="/outfits/new" search={{ date: selectedKey }}>
                <Button size="sm" variant="secondary">{t("outfits.plan")}</Button>
              </Link>
            </div>
          )}
        </div>
      </section>

      <section className="pb-8">
        <h2 className="mb-3 text-xl">{t("outfits.savedLooks")}</h2>
        {data?.outfits?.length ? (
          <div className="grid grid-cols-2 gap-3">
            {data.outfits.map((o: any) => (
              <div key={o.id} className="rounded-2xl bg-card p-3 shadow-sm">
                <div className="grid grid-cols-2 gap-1">
                  {o.outfit_items?.slice(0, 4).map((oi: any, i: number) => (
                    <div key={i} className="aspect-square overflow-hidden rounded-md bg-secondary">
                      {oi.wardrobe_items && data?.urls[displayPath(oi.wardrobe_items)] && (
                        <img src={data.urls[displayPath(oi.wardrobe_items)]} className="h-full w-full object-cover" alt="" />
                      )}
                    </div>
                  ))}
                </div>
                <p className="mt-2 truncate text-sm font-medium">{o.name}</p>
                <p className="text-xs text-muted-foreground">{t("outfits.itemsCount", { count: o.outfit_items?.length ?? 0 })}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-3xl bg-card p-6 text-center shadow-sm">
            <p className="text-sm text-muted-foreground">{t("outfits.noOutfitsYet")}</p>
            <Link to="/outfits/new" className="mt-4 inline-flex rounded-full bg-primary px-5 py-2 text-sm text-primary-foreground">
              {t("outfits.createNewLook")}
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}