import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { signedUrlsMap, displayPath } from "@/lib/storage";
import { categoryLabel } from "@/lib/categories";
import { suggestOutfit, type Occasion, type ItemScores, type SuggestItem } from "@/lib/suggest-outfit";
import { composeOutfitMoodboard } from "@/lib/wardrobe.functions";
import { useLanguage } from "@/lib/i18n";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { format } from "date-fns";
import { de, enUS } from "date-fns/locale";
import {
  Bell,
  Briefcase,
  Coffee,
  Dumbbell,
  Handshake,
  Home as HomeIcon,
  Sun,
  Heart,
  ArrowLeftRight,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";

async function urlToDataUrl(url: string, maxSide = 768): Promise<string> {
  const blob = await (await fetch(url)).blob();
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  // Square white canvas so shoes/bags and clothing share the same background when composed
  const side = Math.max(w, h);
  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, side, side);
  ctx.drawImage(bitmap, (side - w) / 2, (side - h) / 2, w, h);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

const OCCASIONS: { value: Occasion; labelKey: string; icon: typeof Briefcase }[] = [
  { value: "buero", labelKey: "home.occasion.office", icon: Briefcase },
  { value: "kundentermin", labelKey: "home.occasion.client", icon: Handshake },
  { value: "homeoffice", labelKey: "home.occasion.homeoffice", icon: HomeIcon },
  { value: "sport", labelKey: "home.occasion.sport", icon: Dumbbell },
  { value: "frei", labelKey: "home.occasion.free", icon: Coffee },
];

export const Route = createFileRoute("/_authenticated/")({
  component: Home,
  head: () => ({
    meta: [
      { title: "Home — Aivy & Me" },
      { name: "description", content: "Your look for today and your wardrobe at a glance." },
    ],
  }),
});

function Home() {
  const { t, lang } = useLanguage();
  const { user } = Route.useRouteContext();
  const composeMoodboard = useServerFn(composeOutfitMoodboard);

  const today = format(new Date(), "yyyy-MM-dd");

  const { data, isPending } = useQuery({
    queryKey: ["home"],
    queryFn: async () => {
      const [{ data: items }, { data: plan }, { data: recent }, { data: profile }, { data: context }] =
        await Promise.all([
          supabase
            .from("wardrobe_items")
            .select("id, name, image_url, ai_image_url, use_ai_image, category")
            .order("created_at", { ascending: false })
            .limit(200),
          supabase
            .from("outfit_plans")
            .select(
              "outfit_id, outfits(name, outfit_items(item_id, wardrobe_items(id, name, category, image_url, ai_image_url, use_ai_image)))",
            )
            .eq("planned_date", today)
            .maybeSingle(),
          supabase
            .from("outfits")
            .select("id, name")
            .order("created_at", { ascending: false })
            .limit(1),
          supabase.from("profiles").select("display_name").eq("id", user!.id).maybeSingle(),
          supabase.from("daily_context").select("occasion").eq("context_date", today).maybeSingle(),
        ]);
      const paths: string[] = [];
      items?.forEach((i) => i.image_url && paths.push(displayPath(i)));
      (plan as any)?.outfits?.outfit_items?.forEach((oi: any) =>
        oi.wardrobe_items && paths.push(displayPath(oi.wardrobe_items)),
      );
      const urls = await signedUrlsMap(paths);
      return { items: items ?? [], plan, recent: recent ?? [], urls, profile, context };
    },
  });

  const displayName = data?.profile?.display_name?.trim();
  const greeting = displayName ? `${t("home.greeting")}, ${displayName}` : t("home.greeting");

  const temp = useCachedTemperature();
  const allItems = (data?.items ?? []) as SuggestItem[];
  const [suggestion, setSuggestion] = useState<SuggestItem[]>([]);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [occasion, setOccasion] = useState<Occasion | null>(null);
  const [savingOccasion, setSavingOccasion] = useState(false);
  const [moodboardSrc, setMoodboardSrc] = useState<string | null>(null);
  const [moodboardLoading, setMoodboardLoading] = useState(false);
  const [picker, setPicker] = useState<{ mode: "replace"; index: number } | { mode: "add" } | null>(
    null,
  );
  const [pieces, setPieces] = useState<SuggestItem[]>([]);
  const moodboardReqId = useRef(0);
  const lastMoodboardKey = useRef<string>("");

  const plannedOutfit = (data?.plan as any)?.outfits;

  const sourcePieces = useMemo(() => {
    if (plannedOutfit?.outfit_items?.length) {
      return (plannedOutfit.outfit_items as any[])
        .map((oi) => oi.wardrobe_items)
        .filter(Boolean)
        .map((w: any) => ({
          id: w.id ?? displayPath(w),
          name: w.name ?? null,
          category: w.category ?? "sonstiges",
          image_url: w.image_url,
          ai_image_url: w.ai_image_url,
          use_ai_image: w.use_ai_image,
        })) as SuggestItem[];
    }
    return suggestion;
  }, [plannedOutfit, suggestion]);

  const sourceKey = sourcePieces.map((i) => i.id).join(",");

  useEffect(() => {
    setPieces(sourcePieces);
  }, [sourceKey]); // eslint-disable-line react-hooks/exhaustive-deps -- sync when server/suggestion set changes

  /** Editable pieces drive the magazine moodboard. */
  const moodboardItems = pieces;

  useEffect(() => {
    if (data?.context?.occasion) setOccasion(data.context.occasion as Occasion);
  }, [data?.context?.occasion]);

  async function chooseOccasion(o: Occasion) {
    setOccasion(o);
    setSavingOccasion(true);
    const { error } = await supabase
      .from("daily_context")
      .upsert({ user_id: user!.id, context_date: today, occasion: o }, { onConflict: "user_id,context_date" });
    setSavingOccasion(false);
    if (error) toast.error(t("home.savedError"));
  }

  const { data: feedback, refetch: refetchFeedback } = useQuery({
    queryKey: ["outfit-feedback"],
    queryFn: async () => {
      const { data } = await supabase
        .from("outfit_feedback")
        .select("item_ids, liked")
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  const scores = useMemo<ItemScores>(() => {
    const s: ItemScores = {};
    feedback?.forEach((f) => {
      (f.item_ids ?? []).forEach((id: string) => {
        s[id] = (s[id] ?? 0) + (f.liked ? 1 : -1);
      });
    });
    return s;
  }, [feedback]);

  useEffect(() => {
    if (allItems.length) {
      setSuggestion(suggestOutfit(allItems, temp, scores, occasion));
      setFeedbackSent(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.items, temp, scores, occasion]);

  function newSuggestion() {
    setSuggestion(suggestOutfit(allItems, temp, scores, occasion));
    setFeedbackSent(false);
  }

  async function rate(liked: boolean) {
    if (feedbackSent || !pieces.length) return;
    setFeedbackSent(true);
    const { error } = await supabase.from("outfit_feedback").insert({
      user_id: user!.id,
      item_ids: pieces.map((i) => i.id),
      liked,
    });
    if (error) {
      setFeedbackSent(false);
      toast.error(t("home.savedError"));
      return;
    }
    toast.success(t("home.feedbackSaved"));
    refetchFeedback();
  }

  /** Öffnet die Auswahl, um ein Teil aus dem Kleiderschrank zu ersetzen. */
  function openReplace(index: number) {
    setPicker({ mode: "replace", index });
  }

  function openAdd() {
    if (pieces.length >= 6) {
      toast.error(t("home.maxPieces"));
      return;
    }
    setPicker({ mode: "add" });
  }

  function pickFromWardrobe(item: SuggestItem) {
    if (!picker) return;
    if (picker.mode === "replace") {
      setPieces((prev) => {
        const next = [...prev];
        next[picker.index] = item;
        return next;
      });
    } else {
      setPieces((prev) => (prev.length >= 6 ? prev : [...prev, item]));
    }
    setFeedbackSent(false);
    setPicker(null);
  }

  function removePiece(index: number) {
    setPieces((prev) => prev.filter((_, i) => i !== index));
    setFeedbackSent(false);
  }

  const replacingItem =
    picker?.mode === "replace" ? pieces[picker.index] : null;
  const pickerCandidates = useMemo(() => {
    if (!picker) return [] as SuggestItem[];
    const used = new Set(pieces.map((i) => i.id));
    const available = allItems.filter((i) => !used.has(i.id));
    if (picker.mode === "replace" && replacingItem) {
      const sameCategory = available.filter((i) => i.category === replacingItem.category);
      if (sameCategory.length) return sameCategory;
    }
    return available;
  }, [allItems, picker, pieces, replacingItem]);

  useEffect(() => {
    if (moodboardItems.length < 2 || !data?.urls) {
      setMoodboardSrc(null);
      setMoodboardLoading(false);
      lastMoodboardKey.current = "";
      return;
    }

    const key = moodboardItems.map((i) => i.id).join(",");
    // Skip only if we already successfully generated this exact set
    if (key === lastMoodboardKey.current && moodboardSrc) return;

    const reqId = ++moodboardReqId.current;
    let cancelled = false;
    setMoodboardLoading(true);
    setMoodboardSrc(null);

    (async () => {
      try {
        const items = [];
        for (const it of moodboardItems.slice(0, 6)) {
          const url = data.urls[displayPath(it)];
          if (!url) continue;
          const imageDataUrl = await urlToDataUrl(url);
          items.push({ imageDataUrl, category: it.category, name: it.name });
        }
        if (cancelled || reqId !== moodboardReqId.current) return;
        if (items.length < 2) {
          setMoodboardLoading(false);
          return;
        }
        const { b64 } = await composeMoodboard({ data: { items } });
        if (cancelled || reqId !== moodboardReqId.current) return;
        setMoodboardSrc(`data:image/png;base64,${b64}`);
        lastMoodboardKey.current = key;
      } catch (err: any) {
        if (cancelled || reqId !== moodboardReqId.current) return;
        console.error("[moodboard]", err);
        toast.error(err?.message ?? t("home.moodboardFailed"));
        setMoodboardSrc(null);
        // Allow retry on next effect for the same key after a failure
        lastMoodboardKey.current = "";
      } finally {
        if (!cancelled && reqId === moodboardReqId.current) setMoodboardLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // moodboardSrc intentionally omitted — only used as guard above
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moodboardItems, data?.urls, composeMoodboard]);

  // Vor dem ersten Laden nichts anzeigen — sonst blitzt kurz die Anlass-Frage auf,
  // obwohl eigentlich schon ein Outfit für heute geplant ist.
  const showOccasionPicker = !isPending && !plannedOutfit;
  const showSuggestion = !isPending && Boolean(plannedOutfit || occasion);

  return (
    <div className="px-6 pt-10">
      <header className="mb-8 flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-4xl leading-tight">
            <span className="font-serif">{greeting}</span>
            <Sun className="h-6 w-6 text-accent-foreground" strokeWidth={1.5} />
          </div>
          <WeatherWidget />
        </div>
        <button className="rounded-full border border-border p-2">
          <Bell className="h-5 w-5" strokeWidth={1.5} />
        </button>
      </header>

      {showOccasionPicker && (
        <section className="mb-8">
          <h2 className="mb-3 text-xl">{t("home.whatsToday")}</h2>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {OCCASIONS.map((o) => {
              const Icon = o.icon;
              const active = occasion === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => chooseOccasion(o.value)}
                  disabled={savingOccasion}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-sm transition disabled:opacity-60 ${
                    active ? "border-primary bg-accent" : "border-border bg-card hover:bg-secondary"
                  }`}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.5} />
                  {t(o.labelKey)}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {showSuggestion && (
      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl">{t("home.outfitToday")}</h2>
          <span className="text-xs text-muted-foreground">
            {format(new Date(), "EEEE, d. MMMM", { locale: lang === "de" ? de : enUS })}
          </span>
        </div>

        {pieces.length ? (
          <div className="rounded-3xl bg-card p-4 shadow-sm">
            {plannedOutfit?.name ? (
              <p className="mb-3 font-medium">{plannedOutfit.name}</p>
            ) : null}
            {(moodboardLoading || moodboardSrc) && (
              <div className="mb-3 overflow-hidden rounded-2xl border border-border bg-white">
                {moodboardLoading || !moodboardSrc ? (
                  <div className="flex aspect-[4/5] flex-col items-center justify-center gap-2 bg-secondary text-sm text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin" strokeWidth={1.5} />
                    {t("home.moodboardCreating")}
                  </div>
                ) : (
                  <img
                    src={moodboardSrc}
                    alt={t("home.moodboardAlt")}
                    className="aspect-[4/5] w-full bg-white object-contain"
                  />
                )}
              </div>
            )}
            <div className="flex gap-3 overflow-x-auto rounded-2xl border border-border bg-background/50 p-3 pb-2">
              {pieces.map((it, idx) => (
                <div key={`${it.id}-${idx}`} className="group w-24 shrink-0">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => openReplace(idx)}
                      title={t("home.swapPiece")}
                      className="aspect-square w-full overflow-hidden rounded-2xl bg-white transition hover:opacity-90"
                    >
                      {data?.urls[displayPath(it)] && (
                        <img
                          src={data.urls[displayPath(it)]}
                          alt={it.name ?? categoryLabel(it.category, lang)}
                          className="h-full w-full object-contain"
                        />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => openReplace(idx)}
                      title={t("home.swapPiece")}
                      aria-label={t("home.swapPiece")}
                      className="absolute left-1 top-1 rounded-full bg-background/90 p-1.5 text-muted-foreground shadow-sm opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-secondary"
                    >
                      <ArrowLeftRight className="h-3.5 w-3.5" strokeWidth={1.5} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removePiece(idx)}
                      title={t("home.removePiece")}
                      aria-label={t("home.removePiece")}
                      className="absolute right-1 top-1 rounded-full bg-background/90 p-1.5 text-muted-foreground shadow-sm opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-secondary hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                    </button>
                  </div>
                  <p className="mt-1 truncate text-center text-xs">
                    {it.name || categoryLabel(it.category, lang)}
                  </p>
                </div>
              ))}
              {pieces.length < 6 && (
                <div className="w-24 shrink-0">
                  <button
                    type="button"
                    onClick={openAdd}
                    title={t("home.addPiece")}
                    aria-label={t("home.addPiece")}
                    className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-border bg-background text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                  >
                    <Plus className="h-5 w-5" strokeWidth={1.5} />
                  </button>
                  <p className="mt-1 truncate text-center text-xs text-muted-foreground">{t("home.add")}</p>
                </div>
              )}
            </div>
            {!plannedOutfit && (
              <>
                <button
                  onClick={newSuggestion}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm transition hover:bg-secondary"
                >
                  <RefreshCw className="h-4 w-4" strokeWidth={1.5} /> {t("home.newSuggestion")}
                </button>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={() => rate(true)}
                    disabled={feedbackSent}
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-secondary disabled:opacity-40"
                  >
                    <Heart className="h-3.5 w-3.5" strokeWidth={1.5} /> {t("home.like")}
                  </button>
                  <button
                    onClick={() => rate(false)}
                    disabled={feedbackSent}
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-secondary disabled:opacity-40"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={1.5} /> {t("home.dislike")}
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="rounded-3xl bg-card p-5 text-center text-sm text-muted-foreground shadow-sm">
            {t("home.noItemsHint")}
          </div>
        )}
      </section>
      )}

      <Dialog open={picker != null} onOpenChange={(open) => !open && setPicker(null)}>
        <DialogContent className="max-h-[85vh] overflow-hidden rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {picker?.mode === "add" ? t("home.pickerAddTitle") : t("home.pickerReplaceTitle")}
            </DialogTitle>
            <DialogDescription>
              {picker?.mode === "add"
                ? t("home.pickerAddDesc")
                : replacingItem
                  ? pickerCandidates.some((c) => c.category === replacingItem.category)
                    ? t("home.pickerReplaceDescWithCategory", { category: categoryLabel(replacingItem.category, lang) })
                    : t("home.pickerReplaceDesc")
                  : t("home.pickerReplaceFallback")}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] overflow-y-auto pr-1">
            {pickerCandidates.length ? (
              <div className="grid grid-cols-3 gap-3">
                {pickerCandidates.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => pickFromWardrobe(it)}
                    className="text-left transition hover:opacity-90"
                  >
                    <div className="aspect-square overflow-hidden rounded-2xl border border-border bg-white">
                      {data?.urls[displayPath(it)] && (
                        <img
                          src={data.urls[displayPath(it)]}
                          alt={it.name ?? categoryLabel(it.category, lang)}
                          className="h-full w-full object-contain"
                        />
                      )}
                    </div>
                    <p className="mt-1 truncate text-xs">
                      {it.name || categoryLabel(it.category, lang)}
                    </p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t("home.noOtherItems")}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {data?.recent?.length ? (
        <Link
          to="/outfits"
          className="mb-8 flex items-center justify-between text-sm text-muted-foreground"
        >
          <span>{t("home.lastOutfit", { name: data.recent[0].name })}</span>
          <span className="text-primary">{t("home.allOutfits")}</span>
        </Link>
      ) : null}
    </div>
  );
}

const LOCATION_KEY = "aivy-location";

/** Optionale Temperatur aus dem gespeicherten Ort (kein Pflichtfaktor). */
function useCachedTemperature() {
  const [temp, setTemp] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    try {
      const raw = localStorage.getItem(LOCATION_KEY);
      if (!raw) return;
      const loc = JSON.parse(raw);
      if (!loc?.lat || !loc?.lon) return;
      fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m`,
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (active && typeof d?.current?.temperature_2m === "number") setTemp(d.current.temperature_2m);
        })
        .catch(() => {});
    } catch {
      // ignore
    }
    return () => {
      active = false;
    };
  }, []);

  return temp;
}

type SavedLocation = {
  lat: number;
  lon: number;
  name?: string;
  source: "geolocation" | "search";
  permission?: "granted" | "denied" | "prompt";
};

function weatherInfo(code: number, t: (key: string) => string) {
  if (code === 0) return { label: t("weather.clear"), icon: Sun };
  if ([1, 2].includes(code)) return { label: t("weather.partlyCloudy"), icon: CloudSun };
  if (code === 3) return { label: t("weather.cloudy"), icon: Cloud };
  if ([45, 48].includes(code)) return { label: t("weather.foggy"), icon: CloudFog };
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { label: t("weather.rainy"), icon: CloudRain };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { label: t("weather.snow"), icon: CloudSnow };
  if ([95, 96, 99].includes(code)) return { label: t("weather.thunderstorm"), icon: CloudLightning };
  return { label: t("weather.cloudy"), icon: Cloud };
}

function useWeather() {
  const { t, lang } = useLanguage();
  const [location, setLocation] = useState<SavedLocation | null>(null);
  const [weather, setWeather] = useState<{ temp: number; code: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    Array<{ name: string; admin1?: string; country?: string; lat: number; lon: number }> | null
  >(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LOCATION_KEY);
      if (raw) {
        const parsed: SavedLocation = JSON.parse(raw);
        if (parsed?.lat && parsed?.lon) {
          setLocation(parsed);
          fetchWeather(parsed.lat, parsed.lon);
          return;
        }
      }
    } catch {
      // ignore corrupt storage
    }
    initPermission();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function initPermission() {
    if (typeof navigator === "undefined" || !navigator.permissions) {
      requestGeolocation();
      return;
    }
    try {
      const perm = await navigator.permissions.query({ name: "geolocation" });
      if (perm.state === "granted" || perm.state === "prompt") {
        requestGeolocation();
      }
      perm.addEventListener("change", initPermission);
      return () => perm.removeEventListener("change", initPermission);
    } catch {
      requestGeolocation();
    }
  }

  function requestGeolocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLoading(false);
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc: SavedLocation = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          source: "geolocation",
          permission: "granted",
        };
        saveAndFetch(loc);
      },
      () => {
        setLoading(false);
        setError(t("home.locationUnavailable"));
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 },
    );
  }

  async function fetchWeather(lat: number, lon: number) {
    setLoading(true);
    try {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`,
      );
      if (!res.ok) throw new Error();
      const data = await res.json();
      setWeather({ temp: data.current.temperature_2m, code: data.current.weather_code });
      setError(null);
    } catch {
      setError(t("home.weatherLoadError"));
    } finally {
      setLoading(false);
    }
  }

  function saveAndFetch(loc: SavedLocation) {
    setLocation(loc);
    try {
      localStorage.setItem(LOCATION_KEY, JSON.stringify(loc));
    } catch {
      // storage may be unavailable
    }
    fetchWeather(loc.lat, loc.lon);
  }

  async function searchLocation(searchQuery: string) {
    const q = searchQuery.trim();
    if (!q) return;
    setSearching(true);
    setResults(null);
    try {
      const res = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=${lang}&format=json`,
      );
      if (!res.ok) throw new Error();
      const data = await res.json();
      setResults(
        data.results?.map((r: any) => ({
          name: r.name as string,
          admin1: r.admin1 as string | undefined,
          country: r.country as string | undefined,
          lat: r.latitude as number,
          lon: r.longitude as number,
        })) ?? [],
      );
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  function selectResult(result: { name: string; admin1?: string; lat: number; lon: number }) {
    const name = [result.name, result.admin1].filter(Boolean).join(", ");
    saveAndFetch({ lat: result.lat, lon: result.lon, name, source: "search" });
    setShowSearch(false);
    setQuery("");
    setResults(null);
  }

  return {
    location,
    weather,
    loading,
    error,
    showSearch,
    setShowSearch,
    query,
    setQuery,
    results,
    setResults,
    searching,
    searchLocation,
    selectResult,
    requestGeolocation,
  };
}

function WeatherWidget() {
  const { t } = useLanguage();
  const {
    location,
    weather,
    loading,
    showSearch,
    setShowSearch,
    query,
    setQuery,
    results,
    setResults,
    searching,
    searchLocation,
    selectResult,
    requestGeolocation,
  } = useWeather();

  const info = useMemo(() => (weather ? weatherInfo(weather.code, t) : null), [weather, t]);
  const Icon = info?.icon ?? Sun;

  if (weather) {
    return (
      <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-2xl bg-card px-3 py-2 text-sm text-muted-foreground shadow-sm">
        <Icon className="h-4 w-4 shrink-0 text-accent-foreground" strokeWidth={1.5} />
        <span className="whitespace-nowrap">
          {Math.round(weather.temp)}°C, {info?.label}
        </span>
        {location?.name ? (
          <span className="truncate text-xs opacity-70">· {location.name}</span>
        ) : null}
        <button
          onClick={() => setShowSearch(true)}
          className="ml-1 shrink-0 rounded-full p-1 hover:bg-secondary"
          aria-label={t("home.changeLocation")}
        >
          <MapPin className="h-3.5 w-3.5" />
        </button>
        {showSearch && (
          <LocationSearch
            query={query}
            setQuery={setQuery}
            results={results}
            searching={searching}
            onSearch={() => searchLocation(query)}
            onSelect={selectResult}
            onLocate={requestGeolocation}
            onClose={() => {
              setShowSearch(false);
              setQuery("");
              setResults(null);
            }}
          />
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-card px-3 py-2 text-sm text-muted-foreground shadow-sm">
        <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
        <span>{t("home.weatherLoading")}</span>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <button
        onClick={() => setShowSearch(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-secondary"
      >
        <MapPin className="h-3.5 w-3.5" />
        {t("home.addLocation")}
      </button>
      {showSearch && (
        <LocationSearch
          query={query}
          setQuery={setQuery}
          results={results}
          searching={searching}
          onSearch={() => searchLocation(query)}
          onSelect={selectResult}
          onLocate={requestGeolocation}
          onClose={() => {
            setShowSearch(false);
            setQuery("");
            setResults(null);
          }}
        />
      )}
    </div>
  );
}

function LocationSearch({
  query,
  setQuery,
  results,
  searching,
  onSearch,
  onSelect,
  onLocate,
  onClose,
}: {
  query: string;
  setQuery: (v: string) => void;
  results: Array<{ name: string; admin1?: string; lat: number; lon: number }> | null;
  searching: boolean;
  onSearch: () => void;
  onSelect: (r: { name: string; admin1?: string; lat: number; lon: number }) => void;
  onLocate: () => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="mt-2 w-full rounded-2xl bg-card p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSearch();
          }}
          placeholder={t("home.city")}
          className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
        />
        <button
          onClick={onSearch}
          disabled={searching || !query.trim()}
          className="rounded-xl bg-primary p-2 text-primary-foreground disabled:opacity-50"
          aria-label={t("home.search")}
        >
          {searching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
        </button>
        <button
          onClick={onClose}
          className="rounded-xl border border-border p-2 text-muted-foreground hover:bg-secondary"
          aria-label={t("home.close")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <button
        onClick={onLocate}
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-border py-2 text-xs text-muted-foreground transition hover:bg-secondary"
      >
        <MapPin className="h-3.5 w-3.5" />
        {t("home.useCurrentLocation")}
      </button>

      {results && results.length === 0 && (
        <p className="mt-3 text-center text-xs text-muted-foreground">{t("home.noLocationFound")}</p>
      )}
      {results && results.length > 0 && (
        <div className="mt-2 flex flex-col gap-1">
          {results.map((r, i) => (
            <button
              key={`${r.name}-${r.lat}-${i}`}
              onClick={() => onSelect(r)}
              className="text-left rounded-xl px-3 py-2 text-sm hover:bg-secondary"
            >
              {r.name}
              {r.admin1 ? `, ${r.admin1}` : ""}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}