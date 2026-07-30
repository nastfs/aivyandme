import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { signedUrl } from "@/lib/storage";
import { smoothItemImage } from "@/lib/wardrobe.functions";
import { CATEGORIES, type CategoryValue } from "@/lib/categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronLeft, Sparkles, Trash2, Shirt, Check } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/wardrobe/$id")({
  component: ItemDetail,
  head: () => ({
    meta: [
      { title: "Teil bearbeiten — Aivy & Me" },
      { name: "description", content: "Kleidungsstück ansehen, bearbeiten und mit KI glätten." },
    ],
  }),
});

function ItemDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const smooth = useServerFn(smoothItemImage);

  const [name, setName] = useState("");
  const [color, setColor] = useState("");
  const [category, setCategory] = useState<CategoryValue>("sonstiges");
  const [saving, setSaving] = useState(false);
  const [smoothing, setSmoothing] = useState(false);
  const [preview, setPreview] = useState<string>("");
  const [slide, setSlide] = useState(0);

  const { data } = useQuery({
    queryKey: ["wardrobe-item", id],
    queryFn: async () => {
      const { data: item, error } = await supabase
        .from("wardrobe_items")
        .select("id, image_url, ai_image_url, ai_image_url_2, use_ai_image, category, name, color")
        .eq("id", id)
        .single();
      if (error) throw error;
      const url = await signedUrl(item.image_url);
      const aiUrl = item.ai_image_url ? await signedUrl(item.ai_image_url) : null;
      const aiUrl2 = item.ai_image_url_2 ? await signedUrl(item.ai_image_url_2) : null;
      return { item, url, aiUrl, aiUrl2 };
    },
  });

  useEffect(() => {
    if (!data?.item) return;
    setName(data.item.name ?? "");
    setColor(data.item.color ?? "");
    setCategory(data.item.category as CategoryValue);
  }, [data?.item]);

  async function onSave() {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("wardrobe_items")
        .update({ name: name || null, color: color || null, category })
        .eq("id", id);
      if (error) throw error;
      toast.success("Änderungen gespeichert");
      qc.invalidateQueries();
      navigate({ to: "/wardrobe" });
    } catch (e: any) {
      toast.error(e.message ?? "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!confirm("Dieses Teil wirklich löschen?")) return;
    const { error } = await supabase.from("wardrobe_items").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Teil gelöscht");
    qc.invalidateQueries();
    navigate({ to: "/wardrobe" });
  }

  async function onSmooth() {
    if (!data?.url) return;
    setSmoothing(true);
    try {
      const blob = await (await fetch(data.url)).blob();
      const dataUrl: string = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
      const { b64 } = await smooth({
        data: { imageDataUrl: dataUrl, category, view: "top" },
      });
      setPreview(`data:image/png;base64,${b64}`);
      toast.success("Vorschlag fertig — übernehmen oder verwerfen");
    } catch (e: any) {
      toast.error("KI-Glättung fehlgeschlagen", { description: e.message });
    } finally {
      setSmoothing(false);
    }
  }

  async function applyPreview() {
    if (!preview) return;
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user!.id;
      const blob = await (await fetch(preview)).blob();
      const path = `${uid}/${crypto.randomUUID()}.png`;
      const { error: upErr } = await supabase.storage
        .from("wardrobe")
        .upload(path, blob, { contentType: "image/png" });
      if (upErr) throw upErr;
      const { error } = await supabase
        .from("wardrobe_items")
        .update({ ai_image_url: path, use_ai_image: true })
        .eq("id", id);
      if (error) throw error;
      setPreview("");
      toast.success("Neues Bild übernommen");
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e.message ?? "Übernehmen fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }

  async function toggleUseAi() {
    if (!data?.item) return;
    const next = !(data.item.use_ai_image !== false);
    const { error } = await supabase.from("wardrobe_items").update({ use_ai_image: next }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(next ? "KI-Bild wird angezeigt" : "Originalbild wird angezeigt");
    qc.invalidateQueries();
  }

  return (
    <div className="px-6 pt-10 pb-8">
      <header className="mb-6 flex items-center justify-between">
        <Link to="/wardrobe" className="rounded-full border border-border p-2">
          <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
        </Link>
        <h1 className="text-xl">Teil bearbeiten</h1>
        <button onClick={onDelete} className="rounded-full border border-border p-2 text-muted-foreground">
          <Trash2 className="h-5 w-5" strokeWidth={1.5} />
        </button>
      </header>

      <div className="mb-4 rounded-3xl bg-card p-4 shadow-sm">
        {preview ? (
          <div className="overflow-hidden rounded-2xl bg-secondary">
            <img src={preview} alt={name} className="max-h-96 w-full object-contain" />
          </div>
        ) : (
          (() => {
            const useAi = data?.item?.use_ai_image !== false;
            const slides = [
              ...(data?.aiUrl ? [{ url: data.aiUrl, label: "KI-Bild" }] : []),
              ...(data?.aiUrl2 ? [{ url: data.aiUrl2, label: "KI-Bild · Seitenansicht" }] : []),
              ...(data?.url ? [{ url: data.url, label: "Originalfoto" }] : []),
            ];
            if (!useAi) slides.reverse();
            const idx = Math.min(slide, Math.max(slides.length - 1, 0));
            return (
              <>
                <div
                  className="flex snap-x snap-mandatory gap-3 overflow-x-auto rounded-2xl"
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    setSlide(Math.round(el.scrollLeft / Math.max(el.clientWidth, 1)));
                  }}
                >
                  {slides.map((s) => (
                    <img
                      key={s.url}
                      src={s.url}
                      alt={name}
                      className={`max-h-96 w-full shrink-0 snap-center rounded-2xl bg-secondary object-contain transition ${
                        smoothing ? "opacity-50 blur-sm" : ""
                      }`}
                    />
                  ))}
                </div>
                {slides.length > 1 && (
                  <div className="mt-2 flex items-center justify-center gap-2">
                    {slides.map((s, i) => (
                      <span
                        key={s.url}
                        className={`h-1.5 rounded-full transition-all ${
                          i === idx ? "w-5 bg-primary" : "w-1.5 bg-border"
                        }`}
                      />
                    ))}
                  </div>
                )}
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  {slides[idx]?.label}
                  {slides.length > 1 ? " · wische für weitere Bilder" : ""}
                </p>
              </>
            );
          })()
        )}

        {data?.aiUrl && !preview && (
          <button
            type="button"
            onClick={toggleUseAi}
            className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-border px-4 py-3 text-left text-sm"
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                data.item.use_ai_image === false
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border"
              }`}
            >
              {data.item.use_ai_image === false && <Check className="h-3.5 w-3.5" />}
            </span>
            Originalbild behalten
          </button>
        )}

        {preview ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setPreview("")}>Verwerfen</Button>
            <Button onClick={applyPreview} disabled={saving}>Übernehmen</Button>
          </div>
        ) : (
          <Button variant="outline" className="mt-3 w-full" onClick={onSmooth} disabled={smoothing}>
            <Sparkles className="mr-2 h-4 w-4" />
            {smoothing ? "KI glättet das Bild…" : data?.aiUrl ? "KI-Bild neu erzeugen" : "Bild mit KI glätten"}
          </Button>
        )}
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Glättet Falten vom Halten und säubert den Hintergrund — Farbe, Schnitt und Gebrauchsspuren bleiben erhalten.
        </p>
      </div>

      <div className="space-y-4 rounded-3xl bg-card p-5 shadow-sm">
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

        <Button onClick={onSave} disabled={saving} className="w-full">
          {saving ? "Speichern…" : "Änderungen speichern"}
        </Button>

        <Link
          to="/outfits/new"
          className="flex w-full items-center justify-center gap-2 rounded-full border border-border py-2.5 text-sm"
        >
          <Shirt className="h-4 w-4" strokeWidth={1.5} />
          In einem Outfit kombinieren
        </Link>
      </div>
    </div>
  );
}