import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { detectItems, smoothItemImage, refineItem } from "@/lib/wardrobe.functions";
import { CATEGORIES, type CategoryValue } from "@/lib/categories";
import { ImageCropper } from "@/components/ImageCropper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { X, ImagePlus, Sparkles, Check, Crop, PencilLine } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/wardrobe/add")({
  component: AddItem,
  head: () => ({
    meta: [
      { title: "Neues Teil — Aivy & Me" },
      {
        name: "description",
        content:
          "Kleidungsstücke hinzufügen — Foto zuschneiden, getragene Outfits automatisch erkennen, Duplikate abgleichen.",
      },
    ],
  }),
});

type Draft = {
  key: string;
  name: string;
  color: string;
  category: CategoryValue;
  description: string;
  aiDataUrl: string;
  aiDataUrl2: string;
  smoothing: boolean;
  keepOriginal: boolean;
  include: boolean;
  matchName: string | null;
  duplicateDecided: boolean;
  correction: string;
  /** eigenes Einzelfoto dieses Teils (überschreibt das Gruppenfoto) */
  sourceDataUrl: string;
  /** aus dem Originalfoto zugeschnittener Ausschnitt (ohne KI) */
  cropDataUrl: string;
  /** Sicherheit der Erkennung (0–1) */
  confidence: number;
  /** kurzer Inline-Hinweis bei unsicherer Erkennung */
  hint: string;
  /** Inline-Korrektur läuft gerade */
  hintBusy: boolean;
};

/** Schneidet eine normalisierte Bounding-Box aus einer Data-URL aus. Gibt null zurück, wenn keine gültige Box vorliegt. */
async function cropBox(
  src: string,
  box: { x: number; y: number; w: number; h: number } | null | undefined,
): Promise<string | null> {
  if (!box) return null;
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = src;
  });
  // Koordinaten direkt übernehmen, nur an die Bildkanten clampen (kein Zoom, keine Zentrierung)
  const x0 = Math.min(Math.max(box.x, 0), 1) * img.width;
  const y0 = Math.min(Math.max(box.y, 0), 1) * img.height;
  const x1 = Math.min(Math.max(box.x + box.w, 0), 1) * img.width;
  const y1 = Math.min(Math.max(box.y + box.h, 0), 1) * img.height;
  const w = x1 - x0;
  const h = y1 - y0;
  if (w < 8 || h < 8) return null;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w);
  canvas.height = Math.round(h);
  // 1:1-Kopie des Ausschnitts – gleiches Seitenverhältnis, keine Verzerrung
  canvas.getContext("2d")!.drawImage(img, x0, y0, w, h, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.92);
}

function AddItem() {
  const navigate = useNavigate();
  const detect = useServerFn(detectItems);
  const smooth = useServerFn(smoothItemImage);
  const refine = useServerFn(refineItem);
  const fileRef = useRef<HTMLInputElement>(null);
  const correctFileRef = useRef<HTMLInputElement>(null);
  const [rawUrl, setRawUrl] = useState("");
  const [cropping, setCropping] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const [dataUrl, setDataUrl] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [correctKey, setCorrectKey] = useState<string | null>(null);
  const [correctText, setCorrectText] = useState("");
  const [correctImage, setCorrectImage] = useState("");
  const [correcting, setCorrecting] = useState(false);
  const [phase, setPhase] = useState<"review" | "generating" | "done">("review");
  const [addedCount, setAddedCount] = useState(0);

  function patch(key: string, changes: Partial<Draft>) {
    setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...changes } : d)));
  }

  function onFile(f: File) {
    setDrafts([]);
    setDataUrl("");
    setPhase("review");
    const reader = new FileReader();
    reader.onload = () => {
      setRawUrl(reader.result as string);
      setCropping(true);
    };
    reader.readAsDataURL(f);
  }

  async function runDetect(url: string, append: boolean) {
    if (!append) setDataUrl(url);
    setAnalyzing(true);
    try {
      const { data: existingRows } = await supabase
        .from("wardrobe_items")
        .select("id, name, category, color")
        .order("created_at", { ascending: false })
        .limit(120);
      const existing = (existingRows ?? []).map((r) => ({
        id: r.id,
        name: r.name ?? "",
        category: r.category as string,
        color: r.color ?? "",
      }));

      const { items } = await detect({ data: { imageDataUrl: url, existing } });
      const crops = await Promise.all(items.map((it) => cropBox(url, it.box).catch(() => null)));
      // Teile ohne gültigen Zuschnitt verwerfen – niemals das ganze Originalfoto als Ersatz
      const kept = items
        .map((it, i) => ({ it, crop: crops[i] }))
        .filter((e): e is { it: (typeof items)[number]; crop: string } => typeof e.crop === "string");
      const stamp = Date.now();
      const next: Draft[] = kept.map(({ it, crop }, i) => ({
        key: `${stamp}-${i}-${it.name}`,
        name: it.name,
        color: it.color,
        category: it.category as CategoryValue,
        description: it.description,
        aiDataUrl: "",
        aiDataUrl2: "",
        smoothing: false,
        keepOriginal: false,
        include: !it.matchName,
        matchName: it.matchName ?? null,
        duplicateDecided: false,
        correction: "",
        // Kein Gruppenfoto als Referenz — nur der Einzel-Crop dieses Teils
        sourceDataUrl: "",
        cropDataUrl: crop,
        confidence: typeof (it as any).confidence === "number" ? (it as any).confidence : 0.7,
        hint: "",
        hintBusy: false,
      }));
      setDrafts((prev) => (append ? [...prev, ...next] : next));
      if (!kept.length) {
        toast("Kein Kleidungsstück erkannt", {
          description: "Zoome mit „Wurde etwas nicht erkannt?“ näher an das Teil heran.",
        });
      } else {
        toast.success(kept.length > 1 ? `${kept.length} Teile erkannt` : "Teil erkannt", {
          description: kept.map((k) => k.it.name).join(", "),
        });
      }
    } catch (e: any) {
      toast.error("Automatische Erkennung fehlgeschlagen", { description: e.message });
    } finally {
      setAnalyzing(false);
    }
  }

  async function analyze(url: string) {
    return runDetect(url, false);
  }

  async function onSave() {
    if (!dataUrl) return;
    const chosen = drafts.filter((d) => d.include);
    if (!chosen.length) return toast.error("Wähle mindestens ein Teil aus");
    setPhase("generating");
    // Schritt 3: KI-Bilder erst jetzt erzeugen
    const generated = await Promise.all(
      chosen.map(async (d) => {
        // STRIKT: nur der Ausschnitt genau dieses Teils (oder ein Einzelfoto der Nutzerin)
        const base = d.sourceDataUrl || d.cropDataUrl;
        if (!base) {
          toast.error(`Kein Einzel-Ausschnitt für „${d.name}"`);
          return { ...d, aiDataUrl: "", aiDataUrl2: "" };
        }
        patch(d.key, { smoothing: true });
        let aiDataUrl = "";
        let aiDataUrl2 = "";
        try {
          const { b64 } = await smooth({
            data: {
              imageDataUrl: base,
              category: d.category,
              view: "top",
              correction: d.correction || undefined,
            },
          });
          aiDataUrl = `data:image/png;base64,${b64}`;
        } catch {
          toast.error(`KI-Bild für „${d.name}" fehlgeschlagen`, {
            description: "Das Originalfoto wird verwendet.",
          });
        }
        if (d.category === "schuhe") {
          try {
            const r2 = await smooth({
              data: { imageDataUrl: base, category: "schuhe", view: "side" },
            });
            aiDataUrl2 = `data:image/png;base64,${r2.b64}`;
          } catch {}
        }
        patch(d.key, { aiDataUrl, aiDataUrl2, smoothing: false });
        return { ...d, aiDataUrl, aiDataUrl2 };
      }),
    );
    return saveInner(generated);
  }

  function removeDraft(key: string) {
    setDrafts((ds) => ds.filter((d) => d.key !== key));
    toast("Vorschlag verworfen");
  }

  /** Inline-Korrektur direkt auf der Karte (ohne Dialog), z. B. „Cardigan offen“. */
  async function applyHint(key: string) {
    const d = drafts.find((x) => x.key === key);
    const text = d?.hint.trim();
    if (!d || !text || text === d.correction) return;
    patch(key, { hintBusy: true });
    try {
      const refined = await refine({
        data: { correction: text, name: d.name, category: d.category, color: d.color },
      });
      patch(key, {
        name: refined.name,
        category: refined.category as CategoryValue,
        color: refined.color,
        correction: text,
        hintBusy: false,
      });
    } catch (e: any) {
      patch(key, { hintBusy: false });
      toast.error(e.message ?? "Korrektur fehlgeschlagen");
    }
  }

  async function applyCorrection() {
    const d = drafts.find((x) => x.key === correctKey);
    const text = correctText.trim();
    if (!d || (!text && !correctImage)) return;
    setCorrecting(true);
    try {
      const refined = await refine({
        data: {
          correction: text,
          imageDataUrl: correctImage || undefined,
          name: d.name,
          category: d.category,
          color: d.color,
        },
      });
      const base = correctImage || d.sourceDataUrl || dataUrl;
      patch(d.key, {
        name: refined.name,
        category: refined.category as CategoryValue,
        color: refined.color,
        correction: text,
        sourceDataUrl: correctImage || d.sourceDataUrl,
        keepOriginal: false,
        smoothing: false,
        aiDataUrl: "",
        aiDataUrl2: "",
      });
      setCorrectKey(null);
      setCorrectText("");
      setCorrectImage("");
      void base;
      toast.success(`Korrektur übernommen: ${refined.name}`);
    } catch (e: any) {
      toast.error(e.message ?? "Korrektur fehlgeschlagen");
    } finally {
      setCorrecting(false);
    }
  }

  async function saveInner(chosen: Draft[]) {
    if (!dataUrl) return;
    if (!chosen.length) return toast.error("Wähle mindestens ein Teil aus");
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user!.id;
      async function uploadOriginal(url: string) {
        const blob = await (await fetch(url)).blob();
        const path = `${uid}/${crypto.randomUUID()}.jpg`;
        const { error } = await supabase.storage
          .from("wardrobe")
          .upload(path, blob, { contentType: blob.type || "image/jpeg" });
        if (error) throw error;
        return path;
      }
      let groupPath: string | null = null;

      const rows = [];
      for (const d of chosen) {
        let originalPath: string;
        if (d.sourceDataUrl) {
          originalPath = await uploadOriginal(d.sourceDataUrl);
        } else {
          groupPath = groupPath ?? (await uploadOriginal(dataUrl));
          originalPath = groupPath;
        }
        let aiPath: string | null = null;
        let aiPath2: string | null = null;
        if (d.aiDataUrl) {
          const blob = await (await fetch(d.aiDataUrl)).blob();
          const p = `${uid}/${crypto.randomUUID()}.png`;
          const { error } = await supabase.storage
            .from("wardrobe")
            .upload(p, blob, { contentType: "image/png" });
          if (!error) aiPath = p;
        }
        if (d.aiDataUrl2) {
          const blob2 = await (await fetch(d.aiDataUrl2)).blob();
          const p2 = `${uid}/${crypto.randomUUID()}.png`;
          const { error } = await supabase.storage
            .from("wardrobe")
            .upload(p2, blob2, { contentType: "image/png" });
          if (!error) aiPath2 = p2;
        }
        rows.push({
          user_id: uid,
          image_url: originalPath,
          ai_image_url: aiPath,
          ai_image_url_2: aiPath2,
          use_ai_image: !d.keepOriginal,
          category: d.category,
          name: d.name || null,
          color: d.color || null,
        });
      }
      const { error: insErr } = await supabase.from("wardrobe_items").insert(rows);
      if (insErr) throw insErr;
      toast.success(rows.length > 1 ? `${rows.length} Teile gespeichert` : "Teil gespeichert");
      setAddedCount(rows.length);
      setPhase("done");
    } catch (e: any) {
      toast.error(e.message ?? "Speichern fehlgeschlagen");
      setPhase("review");
    } finally {
      setSaving(false);
    }
  }

  const multi = drafts.length > 1;

  return (
    <div className="px-6 pt-10 pb-8">
      {cropping && rawUrl && (
        <ImageCropper
          src={rawUrl}
          onCancel={() => {
            setCropping(false);
            const wasRescan = rescanning;
            setRescanning(false);
            if (!wasRescan && !dataUrl) analyze(rawUrl);
          }}
          onDone={(url) => {
            setCropping(false);
            if (rescanning) {
              setRescanning(false);
              runDetect(url, true);
            } else {
              analyze(url);
            }
          }}
        />
      )}

      <header className="mb-6 flex items-center justify-between">
        <Link to="/wardrobe" className="rounded-full border border-border p-2">
          <X className="h-5 w-5" strokeWidth={1.5} />
        </Link>
        <h1 className="text-xl">Neue Teile</h1>
        <div className="w-9" />
      </header>

      <p className="mb-6 text-center text-sm text-muted-foreground">
        Fotografiere einzelne Teile, mehrere auf einmal — oder lade ein Foto von dir im Outfit hoch.
        Die KI erkennt ausschließlich reine Bekleidung — Oberteile, Pullover, Jacken, Hosen, Röcke
        und Kleider — und schneidet sie aus deinem Foto zu. Schuhe, Socken und
        Accessoires werden bewusst nicht erkannt. Die KI-Bilder werden erst nach deiner Bestätigung
        erstellt.
      </p>

      <div className="mb-6 rounded-3xl bg-card p-4 shadow-sm">
        {dataUrl ? (
          <img src={dataUrl} alt="" className="mx-auto max-h-56 rounded-2xl object-contain" />
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border py-12"
          >
            <ImagePlus className="h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
            <span className="text-sm text-muted-foreground">Foto auswählen (JPG, PNG, HEIC)</span>
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
        {dataUrl && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setCropping(true)}>
              <Crop className="mr-2 h-4 w-4" />
              Zuschneiden
            </Button>
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              Foto ändern
            </Button>
          </div>
        )}
      </div>

      {dataUrl && (
        <div className="mb-4 flex items-center gap-3 text-sm text-primary/80">
          {analyzing ? (
            <>
              <div className="flex items-end gap-2" aria-hidden="true">
                <div
                  className="h-10 w-10 animate-[blob-breathe_2.4s_ease-in-out_infinite] bg-primary"
                  style={{ borderRadius: "60% 40% 44% 56% / 46% 58% 42% 54%" }}
                />
                <div
                  className="h-6 w-6 animate-[blob-breathe_2.4s_ease-in-out_120ms_infinite] bg-accent"
                  style={{ borderRadius: "44% 56% 60% 40% / 54% 46% 58% 42%" }}
                />
              </div>
              <span>KI analysiert dein Foto…</span>
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              <span>
                {multi
                  ? `${drafts.filter((d) => d.include).length} von ${drafts.length} Teilen werden angelegt`
                  : "Passt das? Ändere gerne noch:"}
              </span>
            </>
          )}
        </div>
      )}

      {dataUrl && !analyzing && drafts.length === 0 && (
        <Button variant="outline" onClick={() => analyze(dataUrl)} className="mb-4 w-full">
          <Sparkles className="mr-2 h-4 w-4" />
          Teile erkennen
        </Button>
      )}

      {rawUrl && !analyzing && phase === "review" && (
        <Button
          variant="outline"
          onClick={() => {
            setRescanning(true);
            setCropping(true);
          }}
          className="mb-4 w-full"
        >
          <Crop className="mr-2 h-4 w-4" />
          Wurde etwas nicht erkannt? Bereich heranzoomen
        </Button>
      )}

      <div className="space-y-4">
        {(phase === "done" ? [] : drafts).map((d, i) => (
          <div
            key={d.key}
            className="relative space-y-4 rounded-3xl bg-card p-5 shadow-sm animate-[card-enter_0.4s_ease-out_forwards]"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <button
              type="button"
              onClick={() => removeDraft(d.key)}
              aria-label="Vorschlag nicht übernehmen"
              className="absolute right-3 top-3 rounded-full border border-border bg-background p-1.5 text-muted-foreground"
            >
              <X className="h-4 w-4" strokeWidth={1.5} />
            </button>
            {d.matchName && !d.duplicateDecided && (
              <div className="rounded-2xl border border-primary/40 bg-accent p-4">
                <p className="text-sm">
                  Kennen wir das schon? Das sieht aus wie „{d.matchName}" in deinem Schrank.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => patch(d.key, { duplicateDecided: true, include: false })}
                  >
                    Ja, dasselbe
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => patch(d.key, { duplicateDecided: true, include: true })}
                  >
                    Nein, neu anlegen
                  </Button>
                </div>
              </div>
            )}
            {d.matchName && d.duplicateDecided && (
              <p className="text-xs text-muted-foreground">
                {d.include
                  ? `Wird trotz Ähnlichkeit zu „${d.matchName}" neu angelegt.`
                  : `Bereits im Schrank als „${d.matchName}" — wird nicht noch einmal angelegt.`}
              </p>
            )}

            <div className="flex gap-4">
              <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-secondary">
                <img
                  src={
                    !d.keepOriginal && d.aiDataUrl
                      ? d.aiDataUrl
                      : d.sourceDataUrl || d.cropDataUrl || dataUrl
                  }
                  alt=""
                  className={`h-full w-full object-contain transition ${d.smoothing ? "opacity-50 blur-sm" : ""}`}
                />
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-xs text-muted-foreground">
                  {d.smoothing
                    ? "KI-Bild wird erstellt…"
                    : d.keepOriginal
                      ? "Originalfoto"
                      : d.aiDataUrl
                        ? "KI-Bild"
                        : "Ausschnitt aus deinem Foto"}
                </p>
                <button
                  type="button"
                  onClick={() => patch(d.key, { keepOriginal: !d.keepOriginal })}
                  className="flex w-full items-center gap-2 rounded-xl border border-border px-3 py-2 text-left text-xs"
                >
                  <Box checked={d.keepOriginal} />
                  Originalbild behalten
                </button>
                {multi && (
                  <button
                    type="button"
                    onClick={() => patch(d.key, { include: !d.include, duplicateDecided: true })}
                    className="flex w-full items-center gap-2 rounded-xl border border-border px-3 py-2 text-left text-xs"
                  >
                    <Box checked={d.include} />
                    Teil anlegen
                  </button>
                )}
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Name</Label>
              <Input
                value={d.name}
                onChange={(e) => patch(d.key, { name: e.target.value })}
                placeholder="z. B. Beiger Blazer"
              />
              <div
                className={`grid transition-all duration-200 ease-out ${
                  d.confidence < 0.65
                    ? "mt-2 grid-rows-[1fr] opacity-100"
                    : "grid-rows-[0fr] opacity-0"
                }`}
              >
                <div className="overflow-hidden">
                  <Input
                    value={d.hint}
                    onChange={(e) => patch(d.key, { hint: e.target.value })}
                    onBlur={() => void applyHint(d.key)}
                    disabled={d.hintBusy}
                    placeholder="Kurzer Hinweis? z. B. 'Cardigan offen'"
                    className="h-9 border-dashed text-xs text-muted-foreground"
                  />
                  {d.hintBusy && (
                    <p className="mt-1.5 text-xs text-muted-foreground">Hinweis wird übernommen…</p>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Kategorie</Label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => patch(d.key, { category: c.value })}
                    className={`rounded-full border px-3 py-1.5 text-sm ${d.category === c.value ? "border-primary bg-accent" : "border-border bg-background"}`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Farbe</Label>
              <Input
                value={d.color}
                onChange={(e) => patch(d.key, { color: e.target.value })}
                placeholder="z. B. Beige"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                setCorrectKey(d.key);
                setCorrectText(d.correction);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground"
            >
              <PencilLine className="h-3.5 w-3.5" />
              Falsch erkannt? Beschreiben & neu erzeugen
            </button>
            {d.correction && (
              <p className="text-xs text-muted-foreground">Deine Korrektur: „{d.correction}"</p>
            )}
            {d.sourceDataUrl && (
              <p className="text-xs text-muted-foreground">Eigenes Einzelfoto angehängt</p>
            )}
          </div>
        ))}
      </div>

      <Dialog open={!!correctKey} onOpenChange={(o) => !o && setCorrectKey(null)}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle>Was ist es wirklich?</DialogTitle>
            <DialogDescription>
              Beschreibe kurz, was falsch erkannt wurde — oder lade einfach ein einzelnes Foto genau
              dieses Teils hoch. Name, Kategorie und KI-Bild werden neu erzeugt.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={correctText}
            onChange={(e) => setCorrectText(e.target.value)}
            rows={4}
            placeholder="z. B. Das ist ein Cardigan, offen zu tragen, mit V-Ausschnitt."
          />
          <input
            ref={correctFileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const reader = new FileReader();
              reader.onload = () => setCorrectImage(reader.result as string);
              reader.readAsDataURL(f);
              e.target.value = "";
            }}
          />
          {correctImage ? (
            <div className="flex items-center gap-3 rounded-2xl border border-border p-3">
              <img src={correctImage} alt="" className="h-16 w-16 rounded-xl object-cover" />
              <p className="flex-1 text-xs text-muted-foreground">
                Dieses Foto wird als Grundlage für das Teil verwendet.
              </p>
              <button
                type="button"
                onClick={() => setCorrectImage("")}
                aria-label="Foto entfernen"
                className="rounded-full border border-border p-1.5 text-muted-foreground"
              >
                <X className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>
          ) : (
            <Button variant="outline" onClick={() => correctFileRef.current?.click()}>
              <ImagePlus className="mr-2 h-4 w-4" />
              Einzelfoto dieses Teils anhängen
            </Button>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCorrectKey(null);
                setCorrectImage("");
              }}
            >
              Abbrechen
            </Button>
            <Button
              onClick={applyCorrection}
              disabled={correcting || (!correctText.trim() && !correctImage)}
            >
              {correcting ? "Übernehme…" : "Korrektur übernehmen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {phase === "done" && (
        <div className="mt-6 space-y-4 rounded-3xl bg-card p-5 text-center shadow-sm">
          <p className="text-sm">
            {addedCount > 1
              ? `${addedCount} Teile wurden deinem Kleiderschrank hinzugefügt.`
              : "Das Teil wurde deinem Kleiderschrank hinzugefügt."}
          </p>
          <button
            type="button"
            disabled
            aria-disabled="true"
            className="flex w-full cursor-not-allowed items-center justify-between gap-3 rounded-2xl border border-border bg-secondary/60 px-4 py-3 text-left text-xs text-muted-foreground opacity-60"
          >
            <span>
              Auch Accessoires wie Schmuck, Gürtel oder Taschen automatisch erkennen lassen?
            </span>
            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide">
              Pro
            </span>
          </button>
          <Button className="w-full" onClick={() => navigate({ to: "/wardrobe" })}>
            Zum Kleiderschrank
          </Button>
        </div>
      )}

      {drafts.length > 0 && phase !== "done" && (
        <div className="sticky bottom-4 z-10 mt-6">
          <Button
            onClick={onSave}
            disabled={saving || analyzing || phase === "generating"}
            className="w-full shadow-lg"
          >
            {saving
              ? "Speichern…"
              : phase === "generating"
                ? "KI-Bilder werden erstellt…"
                : multi
                  ? `${drafts.filter((d) => d.include).length} Teile bestätigen & Bilder erstellen`
                  : "Bestätigen & Bild erstellen"}
          </Button>
        </div>
      )}
    </div>
  );
}

function Box({ checked }: { checked: boolean }) {
  return (
    <span
      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
    >
      {checked && <Check className="h-3 w-3" />}
    </span>
  );
}
