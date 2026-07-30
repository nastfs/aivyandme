import { useCallback, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Button } from "@/components/ui/button";

const RATIOS = [
  { label: "Frei (3:4)", value: 3 / 4 },
  { label: "Quadrat", value: 1 },
  { label: "Quer", value: 4 / 3 },
];

async function cropToDataUrl(src: string, area: Area): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = src;
  });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(area.width));
  canvas.height = Math.max(1, Math.round(area.height));
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(
    img,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas.toDataURL("image/jpeg", 0.92);
}

export function ImageCropper({
  src,
  onCancel,
  onDone,
}: {
  src: string;
  onCancel: () => void;
  onDone: (dataUrl: string) => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [aspect, setAspect] = useState(3 / 4);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  const onComplete = useCallback((_: Area, px: Area) => setArea(px), []);

  async function apply() {
    if (!area) return;
    setBusy(true);
    try {
      onDone(await cropToDataUrl(src, area));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between px-5 py-4">
        <button onClick={onCancel} className="text-sm text-muted-foreground">
          Abbrechen
        </button>
        <p className="text-sm">Ausschnitt wählen</p>
        <div className="w-16" />
      </div>

      <div className="relative flex-1 bg-secondary">
        <Cropper
          image={src}
          crop={crop}
          zoom={zoom}
          aspect={aspect}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onComplete}
          restrictPosition={false}
        />
      </div>

      <div className="space-y-4 px-5 pb-8 pt-5">
        <p className="text-center text-xs text-muted-foreground">
          Ziehe das Bild und zoome auf das, was eingescannt werden soll.
        </p>
        <input
          type="range"
          min={1}
          max={5}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="w-full accent-primary"
          aria-label="Zoom"
        />
        <div className="flex justify-center gap-2">
          {RATIOS.map((r) => (
            <button
              key={r.label}
              type="button"
              onClick={() => setAspect(r.value)}
              className={`rounded-full border px-3 py-1.5 text-xs ${
                aspect === r.value ? "border-primary bg-accent" : "border-border"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => onDone(src)}>
            Ohne Zuschnitt
          </Button>
          <Button onClick={apply} disabled={busy || !area}>
            {busy ? "Zuschneiden…" : "Weiter"}
          </Button>
        </div>
      </div>
    </div>
  );
}
