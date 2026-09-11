export type SuggestItem = {
  id: string;
  name: string | null;
  category: string;
  image_url: string;
  ai_image_url?: string | null;
  use_ai_image?: boolean | null;
};

function pick<T>(arr: T[]): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Stellt einen Outfit-Vorschlag zusammen.
 * Basis: Kleid ODER Oberteil + Hose/Rock. Optional Blazer/Schuhe/Tasche.
 * "sport"-Teile werden nur mit anderen "sport"-Teilen kombiniert.
 * Temperatur (optional) beeinflusst nur die Gewichtung, ist kein Pflichtfaktor.
 */
export function suggestOutfit(items: SuggestItem[], temp?: number | null): SuggestItem[] {
  if (!items.length) return [];

  const sport = items.filter((i) => i.category === "sport");
  const normal = items.filter((i) => i.category !== "sport");

  // Sport-Outfit nur, wenn genug Sport-Teile da sind und keine normale Basis möglich ist
  const hasNormalBase =
    normal.some((i) => i.category === "kleider") ||
    (normal.some((i) => i.category === "oberteile") &&
      normal.some((i) => i.category === "hosen" || i.category === "roecke"));

  if (!hasNormalBase && sport.length >= 2) {
    const shuffled = [...sport].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(3, shuffled.length));
  }
  if (!hasNormalBase) return [];

  const by = (c: string) => normal.filter((i) => i.category === c);
  const out: SuggestItem[] = [];

  const warm = typeof temp === "number" && temp >= 22;
  const cold = typeof temp === "number" && temp <= 12;

  const dresses = by("kleider");
  const tops = by("oberteile");
  const bottoms = [...by("hosen"), ...by("roecke")];
  const warmBottoms = warm ? by("roecke").concat(by("hosen")) : cold ? by("hosen").concat(by("roecke")) : bottoms;

  const useDress = dresses.length > 0 && (tops.length === 0 || bottoms.length === 0 || Math.random() < (warm ? 0.6 : 0.4));

  if (useDress) {
    const d = pick(dresses);
    if (d) out.push(d);
  } else {
    const t = pick(tops);
    const b = pick(warmBottoms.slice(0, Math.max(1, Math.ceil(warmBottoms.length * (temp == null ? 1 : 0.8)))) );
    if (t) out.push(t);
    if (b) out.push(b);
  }

  if (out.length === 0) return [];

  const blazers = by("blazer");
  if (blazers.length && !warm && (cold || Math.random() < 0.5)) {
    const bl = pick(blazers);
    if (bl) out.push(bl);
  }

  const shoes = by("schuhe");
  if (shoes.length && Math.random() < 0.8) {
    const s = pick(shoes);
    if (s) out.push(s);
  }

  const bags = by("taschen");
  if (bags.length && Math.random() < 0.5) {
    const bag = pick(bags);
    if (bag) out.push(bag);
  }

  return out;
}
