import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { detectItems, smoothItemImage } from "@/lib/wardrobe.functions";
import { CATEGORIES, type CategoryValue } from "@/lib/categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, ImagePlus, Sparkles, Check } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/wardrobe/add")({
  component: AddItem,
  head: () => ({
    meta: [
      { title: "Neues Teil — Aivy & Me" },
      {
        name: "description",
        content: "Neue Kleidungsstücke hinzufügen — auch mehrere auf einem Foto, automatisch erkannt.",
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
  smoothing: boolean;
  keepOriginal: boolean;
  include: boolean;
};

function AddItem() {
  const navigate = useNavigate();
  const detect = useServerFn(detectItems);
  const smooth = useServerFn(smoothItemImage);
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dataUrl, setDataUrl] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);

  function patch(key: string, changes: Partial<Draft>) {
    setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...changes } : d)));
  }

  async function onFile(f: File) {
    setFile(f);
    setDrafts([]);
    const reader = new FileReader();
    reader.onload = async () => {
      const url = reader.result as string;
      setDataUrl(url);
      setAnalyzing(true);
      try {
        const { items } = await detect({ data: { imageDataUrl: url } });
        const next: Draft[] = items.map((it, i) => ({
          key: `${i}-${it.name}`,
          name: it.name,
          color: it.color,
          category: it.category as CategoryValue,
          description: it.description,
          aiDataUrl: "",
          smoothing: true,
          keepOriginal: false,
          include: true,
        }));
        setDrafts(next);
        toast.success(
          items.length > 1 ? `${items.length} Teile erkannt` : "Teil erkannt",
          { description: items.map((i) => i.name).join(", ") },
        );
        // KI-Bilder für jedes Teil automatisch erzeugen
        next.forEach((d) => {
          smooth({
            data: {
              imageDataUrl: url,
              focus: next.length > 1 ? d.description || d.name : undefined,
            },
          })
            .then(({ b64 }) => patch(d.key, { aiDataUrl: `data:image/png;base64,${b64}`, smoothing: false }))
            .catch(() => {
              patch(d.key, { smoothing: false });
              toast.error(`KI-Bild für „${d.name}" fehlgeschlagen`, {
                description: "Das Originalfoto wird verwendet.",
              });
            });
        });
      } catch (e: any) {
        toast.error("Automatische Erkennung fehlgeschlagen", { description: e.message });
      } finally {
        setAnalyzing(false);
      }
    };
    reader.readAsDataURL(f);
  }

  async function onSave() {
    if (!file) return;
    const chosen = drafts.filter((d) => d.include);
    if (!chosen.length) return toast.error("Wähle mindestens ein Teil aus");
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user!.id;
      const ext = file.name.split(".").pop() || "jpg";
      const originalPath = `${uid}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("wardrobe")
        .upload(originalPath, file, { contentType: file.type });
      if (upErr) throw upErr;

      const rows = [];
      for (const d of chosen) {
        let aiPath: string | null = null;
        if (d.aiDataUrl) {
          const blob = await (await fetch(d.aiDataUrl)).blob();
          const p = `${uid}/${crypto.randomUUID()}.png`;
          const { error } = await supabase.storage.from("wardrobe").upload(p, blob, {
            contentType: "image/png",
          });
          if (!error) aiPath = p;
        }
        rows.push({
          user_id: uid,
          image_url: originalPath,
          ai_image_url: aiPath,
          use_ai_image: !d.keepOriginal,
          category: d.category,
          name: d.name || null,
          color: d.color || null,
        });
      }
      const { error: insErr } = await supabase.from("wardrobe_items").insert(rows);
      if (insErr) throw insErr;
      toast.success(rows.length > 1 ? `${rows.length} Teile gespeichert` : "Teil gespeichert");
      navigate({ to: "/wardrobe" });
    } catch (e: any) {
      toast.error(e.message ?? "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }

  const multi = drafts.length > 1;

  return (
    <div className="px-6 pt-10 pb-8">
      <header className="mb-6 flex items-center justify-between">
        <Link to="/wardrobe" className="rounded-full border border-border p-2">
          <X className="h-5 w-5" strokeWidth={1.5} />
        </Link>
        <h1 className="text-xl">Neue Teile</h1>
        <div className="w-9" />
      </header>

      <p className="mb-6 text-center text-sm text-muted-foreground">
        Fotografiere ein einzelnes Teil — oder mehrere auf einmal. Die KI erkennt jedes Teil und legt es
        einzeln an.
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
          <Button variant="outline" className="mt-3 w-full" onClick={() => fileRef.current?.click()}>
            Foto ändern
          </Button>
        )}
      </div>

      {dataUrl && (
        <div className="mb-4 flex items-center gap-2 text-sm text-primary/80">
          <Sparkles className="h-4 w-4" />
          {analyzing
            ? "KI analysiert dein Foto…"
            : multi
              ? `${drafts.filter((d) => d.include).length} von ${drafts.length} Teilen werden angelegt`
              : "Passt das? Ändere gerne noch:"}
        </div>
      )}

      <div className="space-y-4">
        {drafts.map((d) => (
          <div key={d.key} className="space-y-4 rounded-3xl bg-card p-5 shadow-sm">
            <div className="flex gap-4">
              <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-secondary">
                <img
                  src={!d.keepOriginal && d.aiDataUrl ? d.aiDataUrl : dataUrl}
                  alt=""
                  className={`h-full w-full object-cover transition ${d.smoothing && !d.keepOriginal ? "opacity-50 blur-sm" : ""}`}
                />
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-xs text-muted-foreground">
                  {d.smoothing ? "KI glättet das Bild…" : d.keepOriginal ? "Originalfoto" : d.aiDataUrl ? "KI-Bild" : "Originalfoto"}
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
                    onClick={() => patch(d.key, { include: !d.include })}
                    className="flex w-full items-center gap-2 rounded-xl border border-border px-3 py-2 text-left text-xs"
                  >
                    <Box checked={d.include} />
                    Teil anlegen
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={d.name}
                onChange={(e) => patch(d.key, { name: e.target.value })}
                placeholder="z. B. Beiger Blazer"
              />
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
          </div>
        ))}
      </div>

      {drafts.length > 0 && (
        <Button onClick={onSave} disabled={saving || analyzing} className="mt-6 w-full">
          {saving
            ? "Speichern…"
            : multi
              ? `${drafts.filter((d) => d.include).length} Teile zum Kleiderschrank hinzufügen`
              : "Zum Kleiderschrank hinzufügen"}
        </Button>
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
