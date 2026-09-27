export type SuggestItem = {
  id: string;
  name: string | null;
  category: string;
  image_url: string;
  ai_image_url?: string | null;
  use_ai_image?: boolean | null;
};

export type Occasion = "buero" | "kundentermin" | "homeoffice" | "sport" | "frei";

/** Score pro Item-ID: +1 pro "gefällt mir", -1 pro "nicht mein Stil". */
export type ItemScores = Record<string, number>;

/** Max pieces sent to the magazine moodboard (UI + AI). */
export const MAX_OUTFIT_PIECES = 6;

let activeScores: ItemScores = {};

/** Gewichtete Zufallsauswahl: bessere Scores sind wahrscheinlicher, bleiben aber zufällig. */
function pick<T extends { id?: string }>(arr: T[]): T | undefined {
  if (arr.length === 0) return undefined;
  const weights = arr.map((it) => {
    const score = (it.id && activeScores[it.id]) || 0;
    // milde Gewichtung, geklemmt damit Zufall erhalten bleibt
    return Math.min(3, Math.max(0.3, 1 + 0.35 * score));
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < arr.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return arr[i];
  }
  return arr[arr.length - 1];
}

function addUnique(out: SuggestItem[], item?: SuggestItem) {
  if (!item) return;
  if (out.some((i) => i.id === item.id)) return;
  if (out.length >= MAX_OUTFIT_PIECES) return;
  out.push(item);
}

/**
 * Stellt einen möglichst vollständigen Outfit-Vorschlag zusammen.
 * Basis: Kleid ODER Oberteil + Hose/Rock.
 * Dann (wenn vorhanden): Jacke/Blazer (wetterabhängig), Schuhe, Tasche, Accessoire (z. B. Kette).
 * "sport"-Teile werden nur mit anderen "sport"-Teilen kombiniert.
 */
export function suggestOutfit(
  items: SuggestItem[],
  temp?: number | null,
  scores?: ItemScores,
  occasion?: Occasion | null,
): SuggestItem[] {
  activeScores = scores ?? {};
  if (!items.length) return [];

  const sport = items.filter((i) => i.category === "sport");
  const normal = items.filter((i) => i.category !== "sport");

  const warm = typeof temp === "number" && temp >= 22;
  const mild = typeof temp === "number" && temp > 12 && temp < 22;
  const cold = typeof temp === "number" && temp <= 12;
  // Unknown temp: treat as mild/cool so a light layer can still appear
  const wantsLayer = cold || mild || temp == null;

  // Sport ausdrücklich gewählt: möglichst vollständige Sport-Kombi
  if (occasion === "sport" && sport.length >= 2) {
    return buildSportLook(sport);
  }

  const hasNormalBase =
    normal.some((i) => i.category === "kleider") ||
    (normal.some((i) => i.category === "oberteile") &&
      normal.some((i) => i.category === "hosen" || i.category === "roecke"));

  if (!hasNormalBase && (occasion == null || occasion === "sport") && sport.length >= 2) {
    return buildSportLook(sport);
  }
  if (!hasNormalBase) return [];

  const by = (c: string) => normal.filter((i) => i.category === c);
  const out: SuggestItem[] = [];

  const dresses = by("kleider");
  const tops = by("oberteile");
  const bottoms = [...by("hosen"), ...by("roecke")];
  const warmBottoms = warm
    ? by("roecke").concat(by("hosen"))
    : cold
      ? by("hosen").concat(by("roecke"))
      : bottoms;

  const useDress =
    dresses.length > 0 &&
    (tops.length === 0 || bottoms.length === 0 || Math.random() < (warm ? 0.55 : 0.35));

  if (useDress) {
    addUnique(out, pick(dresses));
  } else {
    addUnique(out, pick(tops));
    addUnique(
      out,
      pick(warmBottoms.slice(0, Math.max(1, Math.ceil(warmBottoms.length * (temp == null ? 1 : 0.85))))),
    );
  }

  if (out.length === 0) return [];

  // Jacket / blazer — strongly preferred when cool, almost required for client meetings
  const blazers = by("blazer");
  const layerChance =
    occasion === "kundentermin"
      ? 0.95
      : occasion === "buero"
        ? 0.85
        : cold
          ? 0.95
          : mild || temp == null
            ? 0.75
            : warm
              ? 0.2
              : 0.7;
  if (blazers.length && wantsLayer && Math.random() < layerChance) {
    addUnique(out, pick(blazers));
  } else if (blazers.length && occasion === "kundentermin") {
    addUnique(out, pick(blazers));
  }

  // Shoes — always when available (complete look)
  const shoes = by("schuhe");
  if (shoes.length) addUnique(out, pick(shoes));

  // Handbag — always when available (skip for sport occasion)
  const bags = by("taschen");
  if (bags.length && occasion !== "sport") addUnique(out, pick(bags));

  // Accessories (necklace, etc.) — always when available
  const accessories = by("accessoires");
  if (accessories.length) addUnique(out, pick(accessories));

  // If we still have room and no layer yet but it's cold, force a blazer
  if (cold && blazers.length && !out.some((i) => i.category === "blazer")) {
    addUnique(out, pick(blazers));
  }

  return out;
}

function buildSportLook(sport: SuggestItem[]): SuggestItem[] {
  const out: SuggestItem[] = [];
  const shuffled = [...sport].sort(() => Math.random() - 0.5);
  for (const item of shuffled) {
    addUnique(out, item);
    if (out.length >= Math.min(4, MAX_OUTFIT_PIECES)) break;
  }
  return out;
}
