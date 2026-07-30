import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ALLOWED = [
  "oberteile","hosen","kleider","blazer","roecke","schuhe","taschen","sport","sonstiges",
] as const;
type Cat = (typeof ALLOWED)[number];

export const smoothItemImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { imageDataUrl: string; focus?: string; category?: string; view?: "top" | "side" }) => {
    if (!data?.imageDataUrl?.startsWith("data:image/")) {
      throw new Error("imageDataUrl muss eine Data-URL sein");
    }
    return data;
  })
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("KI ist gerade nicht verfügbar");

    const shoeRule =
      data.category === "schuhe"
        ? data.view === "side"
          ? " WICHTIG (Schuhe, Bild 2 – Seitenansicht): Zeige das Paar Schuhe exakt in strenger Seitenansicht (Profil, 90°), beide Schuhe aufrecht auf einer unsichtbaren Standfläche stehend, direkt hintereinander/nebeneinander ausgerichtet, Zehenspitzen nach links zeigend, Sohlen auf einer horizontalen Linie. Kamera auf Schuhhöhe, keine Perspektive von oben, keine Rotation, keine Schrägansicht."
          : " WICHTIG (Schuhe, Bild 1 – Draufsicht): Zeige das Paar Schuhe exakt von oben (Vogelperspektive, Kamera senkrecht über den Schuhen), beide Schuhe flach nebeneinander parallel liegend, Zehenspitzen nach oben, gleicher Abstand, symmetrisch und mittig. Keine Schrägansicht, keine Rotation, keine Perspektivverzerrung."
        : "";

    const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-image",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  (data.focus
                    ? `Auf diesem Foto sind mehrere Kleidungsstücke zu sehen. Nimm AUSSCHLIESSLICH dieses eine Teil: "${data.focus}". Alle anderen Kleidungsstücke, Objekte und Personen müssen komplett verschwinden. `
                    : "") +
                  "Erzeuge ein professionelles E-Commerce-Produktfoto (Stockfoto-Look) des Kleidungsstücks. Entferne den kompletten Hintergrund und ersetze ihn durch einen komplett gleichmäßigen, reinweißen Studio-Hintergrund ohne Schatten, Textur, Möbel oder Raumdetails. Entferne Hände, Arme, Personen, Kleiderbügel und alles andere, was das Teil hält. Zeige das Teil freigestellt, mittig, gerade ausgerichtet und flach/glatt liegend wie im Online-Shop-Katalog, mit weichem, gleichmäßigem Studiolicht und scharfen sauberen Kanten. Wichtig: Das Kleidungsstück selbst darf NICHT verändert oder verschönert werden — Schnitt, Proportionen, Farbe, Muster, Material, Gebrauchsspuren, Flecken und Knötchen müssen exakt erhalten bleiben. Nur Halte-Falten glätten und den Hintergrund entfernen." +
                  shoeRule,
              },
              { type: "image_url", image_url: { url: data.imageDataUrl } },
            ],
          },
        ],
        modalities: ["image", "text"],
      }),
    });

    if (!res.ok) {
      throw new Error(`Bildbearbeitung fehlgeschlagen (${res.status})`);
    }
    const json = await res.json();
    const b64 = json?.data?.[0]?.b64_json;
    if (!b64) throw new Error("Kein Bild erhalten");
    return { b64 };
  });

export const classifyItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { imageDataUrl: string }) => {
    if (!data?.imageDataUrl?.startsWith("data:image/")) {
      throw new Error("imageDataUrl muss eine Data-URL sein");
    }
    return data;
  })
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { category: "sonstiges" as Cat, name: "Neues Teil", color: "" };
    }

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "Du bist ein Fashion-Assistent. Analysiere das Foto eines Kleidungsstücks und antworte AUSSCHLIESSLICH mit einem JSON-Objekt im Format {\"category\":\"oberteile|hosen|kleider|blazer|roecke|schuhe|taschen|sport|sonstiges\",\"name\":\"kurzer deutscher Name, z.B. 'Weißes T-Shirt'\",\"color\":\"Hauptfarbe deutsch, z.B. 'Beige'\"}. Kein Fließtext, kein Markdown.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Was für ein Kleidungsstück ist das?" },
              { type: "image_url", image_url: { url: data.imageDataUrl } },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      return { category: "sonstiges" as Cat, name: "Neues Teil", color: "" };
    }

    const json = await res.json();
    const raw: string = json?.choices?.[0]?.message?.content ?? "";
    const cleaned = raw.replace(/```json|```/g, "").trim();
    try {
      const parsed = JSON.parse(cleaned);
      const category = ALLOWED.includes(parsed.category) ? (parsed.category as Cat) : "sonstiges";
      return {
        category,
        name: typeof parsed.name === "string" ? parsed.name.slice(0, 60) : "Neues Teil",
        color: typeof parsed.color === "string" ? parsed.color.slice(0, 40) : "",
      };
    } catch {
      return { category: "sonstiges" as Cat, name: "Neues Teil", color: "" };
    }
  });
export type DetectedItem = {
  category: Cat;
  name: string;
  color: string;
  description: string;
};

/** Erkennt ALLE Kleidungsstücke auf einem Foto (z. B. Gruppenfoto mehrerer Teile). */
export const detectItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { imageDataUrl: string }) => {
    if (!data?.imageDataUrl?.startsWith("data:image/")) {
      throw new Error("imageDataUrl muss eine Data-URL sein");
    }
    return data;
  })
  .handler(async ({ data }): Promise<{ items: DetectedItem[] }> => {
    const fallback = {
      items: [
        { category: "sonstiges" as Cat, name: "Neues Teil", color: "", description: "das Kleidungsstück" },
      ],
    };
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return fallback;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "Du bist ein Fashion-Assistent. Erkenne ALLE einzelnen Kleidungsstücke/Accessoires auf dem Foto (auch wenn mehrere Teile nebeneinander liegen). Antworte AUSSCHLIESSLICH mit JSON: {\"items\":[{\"category\":\"oberteile|hosen|kleider|blazer|roecke|schuhe|taschen|sport|sonstiges\",\"name\":\"kurzer deutscher Name\",\"color\":\"Hauptfarbe deutsch\",\"description\":\"eindeutige visuelle Beschreibung inkl. Position im Bild, z.B. 'die beige Leinenhose links unten'\"}]}. Ein Paar Schuhe zählt als ein Teil. Kein Fließtext, kein Markdown.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Welche Kleidungsstücke sind auf diesem Foto?" },
              { type: "image_url", image_url: { url: data.imageDataUrl } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) return fallback;

    const json = await res.json();
    const raw: string = json?.choices?.[0]?.message?.content ?? "";
    try {
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      const list = Array.isArray(parsed?.items) ? parsed.items : [];
      const items: DetectedItem[] = list.slice(0, 12).map((p: any) => ({
        category: ALLOWED.includes(p?.category) ? (p.category as Cat) : "sonstiges",
        name: typeof p?.name === "string" ? p.name.slice(0, 60) : "Neues Teil",
        color: typeof p?.color === "string" ? p.color.slice(0, 40) : "",
        description: typeof p?.description === "string" ? p.description.slice(0, 200) : "",
      }));
      return items.length ? { items } : fallback;
    } catch {
      return fallback;
    }
  });
