import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ALLOWED = [
  "oberteile","hosen","kleider","blazer","roecke","schuhe","taschen","sport","sonstiges",
] as const;
type Cat = (typeof ALLOWED)[number];

export const smoothItemImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { imageDataUrl: string; focus?: string }) => {
    if (!data?.imageDataUrl?.startsWith("data:image/")) {
      throw new Error("imageDataUrl muss eine Data-URL sein");
    }
    return data;
  })
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("KI ist gerade nicht verfügbar");

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
                  "Erzeuge ein professionelles E-Commerce-Produktfoto (Stockfoto-Look) des Kleidungsstücks. Entferne den kompletten Hintergrund und ersetze ihn durch einen komplett gleichmäßigen, reinweißen Studio-Hintergrund ohne Schatten, Textur, Möbel oder Raumdetails. Entferne Hände, Arme, Personen, Kleiderbügel und alles andere, was das Teil hält. Zeige das Teil freigestellt, mittig, gerade ausgerichtet und flach/glatt liegend wie im Online-Shop-Katalog, mit weichem, gleichmäßigem Studiolicht und scharfen sauberen Kanten. Wichtig: Das Kleidungsstück selbst darf NICHT verändert oder verschönert werden — Schnitt, Proportionen, Farbe, Muster, Material, Gebrauchsspuren, Flecken und Knötchen müssen exakt erhalten bleiben. Nur Halte-Falten glätten und den Hintergrund entfernen.",
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