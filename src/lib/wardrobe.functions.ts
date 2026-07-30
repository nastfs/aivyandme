import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ALLOWED = [
  "oberteile","hosen","kleider","blazer","roecke","schuhe","taschen","accessoires","sport","sonstiges",
] as const;
type Cat = (typeof ALLOWED)[number];

export const smoothItemImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { imageDataUrl: string; focus?: string; category?: string; view?: "top" | "side"; correction?: string }) => {
    if (!data?.imageDataUrl?.startsWith("data:image/")) {
      throw new Error("imageDataUrl muss eine Data-URL sein");
    }
    return data;
  })
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("KI ist gerade nicht verfügbar");

    const personRule =
      " Falls eine Person das Teil trägt: extrahiere nur das Kleidungsstück selbst und entferne Person, Haut, Haare und Körperteile vollständig; ergänze verdeckte Bereiche plausibel, ohne Schnitt, Farbe oder Muster zu verändern.";
    const correctionRule = data.correction
      ? ` WICHTIGE KORREKTUR DER NUTZERIN (hat Vorrang vor deiner eigenen Interpretation): "${data.correction}". Stelle das Teil exakt so dar, wie hier beschrieben (z. B. Art des Teils, Ausschnitt, Länge, Öffnung/Knopfleiste), und übernimm dabei Farbe, Material und Muster aus dem Foto.`
      : "";
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
                  personRule +
                  correctionRule +
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
  /** id eines bereits vorhandenen Teils, das die KI für identisch hält */
  matchId?: string | null;
  matchName?: string | null;
};

type ExistingItem = { id: string; name: string; category: string; color: string };

/** Erkennt ALLE Kleidungsstücke auf einem Foto (z. B. Gruppenfoto mehrerer Teile). */
export const detectItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { imageDataUrl: string; existing?: ExistingItem[] }) => {
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

    const existing = (data.existing ?? []).slice(0, 120);
    const existingBlock = existing.length
      ? `\n\nBereits im Schrank vorhandene Teile (JSON): ${JSON.stringify(existing)}. Wenn ein erkanntes Teil sehr wahrscheinlich eines dieser vorhandenen Teile IST (gleiche Art, Farbe, Muster), setze "matchId" auf dessen id. Sonst setze "matchId" auf null. Sei eher zurückhaltend: nur bei klarer Ähnlichkeit einen Match setzen.`
      : "";

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "Du bist ein Fashion-Assistent. Erkenne ALLE einzelnen Kleidungsstücke und Accessoires auf dem Foto. Das Foto kann (a) einzelne Teile flach liegend, (b) mehrere Teile nebeneinander oder (c) eine Person zeigen, die ein komplettes Outfit trägt. Bei getragenen Outfits: erkenne jedes getragene Teil einzeln (Oberteil, Hose/Rock, Kleid, Jacke/Blazer, Schuhe, Tasche) und auch Accessoires wie Sonnenbrillen, Mützen/Hüte/Caps, Schals, Gürtel, auffälligen Schmuck — Accessoires bekommen die Kategorie \"accessoires\". Ignoriere die Person selbst, Körperteile, Haare und den Hintergrund. Antworte AUSSCHLIESSLICH mit JSON: {\"items\":[{\"category\":\"oberteile|hosen|kleider|blazer|roecke|schuhe|taschen|accessoires|sport|sonstiges\",\"name\":\"kurzer deutscher Name\",\"color\":\"Hauptfarbe deutsch\",\"description\":\"eindeutige visuelle Beschreibung inkl. Position, z.B. 'der beige Strickpulli, den die Person oben trägt'\",\"matchId\":null}]}. Ein Paar Schuhe zählt als ein Teil. Kein Fließtext, kein Markdown." +
              existingBlock,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Welche Kleidungsstücke und Accessoires sind auf diesem Foto?" },
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
      const items: DetectedItem[] = list.slice(0, 12).map((p: any) => {
        const match = existing.find((e) => e.id === p?.matchId);
        return {
          category: ALLOWED.includes(p?.category) ? (p.category as Cat) : "sonstiges",
          name: typeof p?.name === "string" ? p.name.slice(0, 60) : "Neues Teil",
          color: typeof p?.color === "string" ? p.color.slice(0, 40) : "",
          description: typeof p?.description === "string" ? p.description.slice(0, 200) : "",
          matchId: match ? match.id : null,
          matchName: match ? match.name : null,
        };
      });
      return items.length ? { items } : fallback;
    } catch {
      return fallback;
    }
  });

/** Korrigiert Name/Kategorie/Farbe anhand einer Nutzerbeschreibung ("falsch erkannt"). */
export const refineItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { correction?: string; imageDataUrl?: string; name?: string; category?: string; color?: string }) => {
    if (!data?.correction?.trim() && !data?.imageDataUrl?.startsWith("data:image/")) {
      throw new Error("Bitte kurz beschreiben oder ein Bild anhängen");
    }
    return data;
  })
  .handler(async ({ data }): Promise<{ name: string; category: Cat; color: string }> => {
    const fallback = {
      name: data.name || "Neues Teil",
      category: (ALLOWED.includes(data.category as Cat) ? data.category : "sonstiges") as Cat,
      color: data.color || "",
    };
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return fallback;

    const userContent: any[] = [
      {
        type: "text",
        text: `Bisher erkannt: Name "${data.name ?? ""}", Kategorie "${data.category ?? ""}", Farbe "${data.color ?? ""}". ${
          data.correction ? `Korrektur der Nutzerin: "${data.correction}".` : ""
        }${data.imageDataUrl ? " Die Nutzerin hat zusätzlich ein Einzelfoto genau dieses Teils angehängt — richte dich in erster Linie danach." : ""} Gib die korrigierten Werte zurück.`,
      },
    ];
    if (data.imageDataUrl) {
      userContent.push({ type: "image_url", image_url: { url: data.imageDataUrl } });
    }

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "Du bist ein Fashion-Assistent. Die Nutzerin korrigiert eine falsche Erkennung. Antworte AUSSCHLIESSLICH mit JSON: {\"category\":\"oberteile|hosen|kleider|blazer|roecke|schuhe|taschen|accessoires|sport|sonstiges\",\"name\":\"kurzer deutscher Name\",\"color\":\"Hauptfarbe deutsch\"}. Kein Markdown.",
          },
          { role: "user", content: userContent },
        ],
      }),
    });
    if (!res.ok) return fallback;
    const json = await res.json();
    const raw: string = json?.choices?.[0]?.message?.content ?? "";
    try {
      const p = JSON.parse(raw.replace(/```json|```/g, "").trim());
      return {
        name: typeof p?.name === "string" && p.name ? p.name.slice(0, 60) : fallback.name,
        category: ALLOWED.includes(p?.category) ? (p.category as Cat) : fallback.category,
        color: typeof p?.color === "string" && p.color ? p.color.slice(0, 40) : fallback.color,
      };
    } catch {
      return fallback;
    }
  });
