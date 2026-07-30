import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { classifyItem, smoothItemImage } from "@/lib/wardrobe.functions";
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
      { name: "description", content: "Neues Kleidungsstück hinzufügen — automatisch kategorisiert." },
    ],
  }),
});

function AddItem() {
  const navigate = useNavigate();
  const classify = useServerFn(classifyItem);
  const smooth = useServerFn(smoothItemImage);
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dataUrl, setDataUrl] = useState<string>("");
  const [aiDataUrl, setAiDataUrl] = useState<string>("");
  const [keepOriginal, setKeepOriginal] = useState(false);
  const [smoothing, setSmoothing] = useState(false);
  const [category, setCategory] = useState<CategoryValue>("sonstiges");
  const [name, setName] = useState("");
  const [color, setColor] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);

  async function onFile(f: File) {
    setFile(f);
    setAiDataUrl("");
    setKeepOriginal(false);
    const reader = new FileReader();
    reader.onload = async () => {
      const url = reader.result as string;
      setDataUrl(url);
      setAnalyzing(true);
      setSmoothing(true);
      // KI-Glättung läuft automatisch parallel zur Erkennung
      smooth({ data: { imageDataUrl: url } })
        .then(({ b64 }) => setAiDataUrl(`data:image/png;base64,${b64}`))
        .catch(() =>
          toast.error("KI-Glättung fehlgeschlagen", {
            description: "Das Originalbild wird verwendet.",
          }),
        )
        .finally(() => setSmoothing(false));
      try {
        const result = await classify({ data: { imageDataUrl: url } });
        setCategory(result.category as CategoryValue);
        setName(result.name);
        setColor(result.color);
        toast.success("Teil erkannt", { description: `${result.name} · ${result.color}` });
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
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user!.id;
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${uid}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("wardrobe").upload(path, file, {
        contentType: file.type,
      });
      if (upErr) throw upErr;

      // KI-Bild zusätzlich speichern — das Original bleibt immer erhalten
      let aiPath: string | null = null;
      if (aiDataUrl) {
        const blob = await (await fetch(aiDataUrl)).blob();
        const p = `${uid}/${crypto.randomUUID()}.png`;
        const { error: aiErr } = await supabase.storage
          .from("wardrobe")
          .upload(p, blob, { contentType: "image/png" });
        if (!aiErr) aiPath = p;
      }

      const { error: insErr } = await supabase.from("wardrobe_items").insert({
        user_id: uid,
        image_url: path,
        ai_image_url: aiPath,
        use_ai_image: !keepOriginal,
        category,
        name: name || null,
        color: color || null,
      });
      if (insErr) throw insErr;
      toast.success("Teil gespeichert");
      navigate({ to: "/wardrobe" });
    } catch (e: any) {
      toast.error(e.message ?? "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-6 pt-10">
      <header className="mb-6 flex items-center justify-between">
        <Link to="/wardrobe" className="rounded-full border border-border p-2">
          <X className="h-5 w-5" strokeWidth={1.5} />
        </Link>
        <h1 className="text-xl">Neues Teil</h1>
        <div className="w-9" />
      </header>

      <p className="mb-6 text-center text-sm text-muted-foreground">
        Füge ganz einfach ein neues Teil hinzu. Die KI erkennt Kategorie und Farbe.
      </p>

      <div className="mb-6 rounded-3xl bg-card p-4 shadow-sm">
        {dataUrl ? (
          <>
            <img
              src={!keepOriginal && aiDataUrl ? aiDataUrl : dataUrl}
              alt=""
              className={`mx-auto max-h-64 rounded-2xl object-contain transition ${
                smoothing && !keepOriginal ? "opacity-50 blur-sm" : ""
              }`}
            />
            <p className="mt-2 text-center text-xs text-muted-foreground">
              {smoothing
                ? "KI glättet dein Foto…"
                : keepOriginal
                  ? "Originalfoto"
                  : aiDataUrl
                    ? "KI-geglättetes Bild"
                    : "Originalfoto"}
            </p>
            <button
              type="button"
              onClick={() => setKeepOriginal((v) => !v)}
              className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-border px-4 py-3 text-left text-sm"
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                  keepOriginal ? "border-primary bg-primary text-primary-foreground" : "border-border"
                }`}
              >
                {keepOriginal && <Check className="h-3.5 w-3.5" />}
              </span>
              Originalbild behalten
            </button>
            <p className="mt-1 text-center text-xs text-muted-foreground">
              Beide Bilder werden gespeichert — du kannst später wechseln.
            </p>
          </>
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
        <div className="space-y-4 rounded-3xl bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-primary/80">
            <Sparkles className="h-4 w-4" />
            {analyzing ? "KI analysiert dein Teil…" : "Passt das? Ändere gerne noch:"}
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Beiger Blazer" />
          </div>

          <div className="space-y-2">
            <Label>Kategorie</Label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  className={`rounded-full border px-3 py-1.5 text-sm ${category === c.value ? "border-primary bg-accent" : "border-border bg-background"}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="color">Farbe</Label>
            <Input id="color" value={color} onChange={(e) => setColor(e.target.value)} placeholder="z. B. Beige" />
          </div>

          <Button onClick={onSave} disabled={saving || analyzing} className="w-full">
            {saving ? "Speichern…" : "Zum Kleiderschrank hinzufügen"}
          </Button>
        </div>
      )}
    </div>
  );
}