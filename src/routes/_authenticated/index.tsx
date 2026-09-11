import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { signedUrlsMap, displayPath } from "@/lib/storage";
import { categoryLabel } from "@/lib/categories";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  Bell,
  Sun,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Loader2,
  MapPin,
  Search,
  X,
} from "lucide-react";

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

  const today = format(new Date(), "yyyy-MM-dd");

  const { data } = useQuery({
    queryKey: ["home"],
    queryFn: async () => {
      const [{ data: items }, { data: plan }, { data: recent }, { data: profile }] = await Promise.all([
        supabase
          .from("wardrobe_items")
          .select("id, name, image_url, ai_image_url, use_ai_image, category")
          .order("created_at", { ascending: false })
          .limit(200),
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
        supabase.from("profiles").select("display_name").eq("id", user!.id).maybeSingle(),
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
      return { items: items ?? [], plan, recent: recent ?? [], urls, profile };
    },
  });

  const displayName = data?.profile?.display_name?.trim();
  const greeting = displayName ? `Guten Tag, ${displayName}` : "Guten Tag";

  const temp = useCachedTemperature();
  const allItems = (data?.items ?? []) as SuggestItem[];
  const [suggestion, setSuggestion] = useState<SuggestItem[]>([]);

  useEffect(() => {
    if (allItems.length) setSuggestion(suggestOutfit(allItems, temp));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.items, temp]);

  const plannedOutfit = (data?.plan as any)?.outfits;

  return (
    <div className="px-6 pt-10">
      <header className="mb-8 flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-4xl leading-tight">
            <span className="font-serif">{greeting}</span>
            <Sun className="h-6 w-6 text-accent-foreground" strokeWidth={1.5} />
          </div>
          <p className="mt-3 text-sm text-primary/70">Heutige Empfehlung</p>
          <WeatherWidget />
        </div>
        <button className="rounded-full border border-border p-2">
          <Bell className="h-5 w-5" strokeWidth={1.5} />
        </button>
      </header>

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl">Dein Outfit für heute</h2>
          <span className="text-xs text-muted-foreground">
            {format(new Date(), "EEEE, d. MMMM", { locale: de })}
          </span>
        </div>

        {plannedOutfit ? (
          <div className="rounded-3xl bg-card p-4 shadow-sm">
            <p className="mb-3 font-medium">{plannedOutfit.name}</p>
            <div className="flex gap-2 overflow-x-auto">
              {plannedOutfit.outfit_items?.map((oi: any, i: number) => (
                <img
                  key={i}
                  src={data?.urls[oi.wardrobe_items ? displayPath(oi.wardrobe_items) : ""] ?? ""}
                  className="h-24 w-24 rounded-2xl bg-secondary object-cover"
                  alt=""
                />
              ))}
            </div>
          </div>
        ) : suggestion.length ? (
          <div className="rounded-3xl bg-card p-4 shadow-sm">
            <div className="flex gap-3 overflow-x-auto pb-1">
              {suggestion.map((it) => (
                <Link key={it.id} to="/wardrobe/$id" params={{ id: it.id }} className="w-24 shrink-0">
                  <div className="aspect-square overflow-hidden rounded-2xl bg-secondary">
                    {data?.urls[displayPath(it)] && (
                      <img
                        src={data.urls[displayPath(it)]}
                        alt={it.name ?? categoryLabel(it.category)}
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <p className="mt-1 truncate text-center text-xs">
                    {it.name || categoryLabel(it.category)}
                  </p>
                </Link>
              ))}
            </div>
            <button
              onClick={() => setSuggestion(suggestOutfit(allItems, temp))}
              className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm transition hover:bg-secondary"
            >
              <RefreshCw className="h-4 w-4" strokeWidth={1.5} /> Neu vorschlagen
            </button>
          </div>
        ) : (
          <div className="rounded-3xl bg-card p-5 text-center text-sm text-muted-foreground shadow-sm">
            Füge ein paar Teile hinzu — dann schlagen wir dir hier täglich ein Outfit vor.
          </div>
        )}
      </section>


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

const LOCATION_KEY = "aivy-location";

type SavedLocation = {
  lat: number;
  lon: number;
  name?: string;
  source: "geolocation" | "search";
  permission?: "granted" | "denied" | "prompt";
};

function weatherInfo(code: number) {
  if (code === 0) return { label: "klar", icon: Sun };
  if ([1, 2].includes(code)) return { label: "leicht bewölkt", icon: CloudSun };
  if (code === 3) return { label: "bewölkt", icon: Cloud };
  if ([45, 48].includes(code)) return { label: "neblig", icon: CloudFog };
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { label: "regnerisch", icon: CloudRain };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { label: "Schnee", icon: CloudSnow };
  if ([95, 96, 99].includes(code)) return { label: "Gewitter", icon: CloudLightning };
  return { label: "bewölkt", icon: Cloud };
}

function useWeather() {
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
        setError("Standort nicht verfügbar");
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
      setError("Wetter konnte nicht geladen werden");
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
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=de&format=json`,
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

  const info = useMemo(() => (weather ? weatherInfo(weather.code) : null), [weather]);
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
          aria-label="Ort ändern"
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
        <span>Wetter wird geladen…</span>
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
        Ort für Wetter hinzufügen
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
          placeholder="Stadt oder PLZ"
          className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
        />
        <button
          onClick={onSearch}
          disabled={searching || !query.trim()}
          className="rounded-xl bg-primary p-2 text-primary-foreground disabled:opacity-50"
          aria-label="Suchen"
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
          aria-label="Schließen"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <button
        onClick={onLocate}
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-border py-2 text-xs text-muted-foreground transition hover:bg-secondary"
      >
        <MapPin className="h-3.5 w-3.5" />
        Aktuellen Standort verwenden
      </button>

      {results && results.length === 0 && (
        <p className="mt-3 text-center text-xs text-muted-foreground">Keinen Ort gefunden.</p>
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