export const CATEGORIES = [
  { value: "oberteile", label: "Oberteile" },
  { value: "hosen", label: "Hosen" },
  { value: "kleider", label: "Kleider" },
  { value: "blazer", label: "Blazer" },
  { value: "roecke", label: "Röcke" },
  { value: "schuhe", label: "Schuhe" },
  { value: "taschen", label: "Taschen" },
  { value: "sport", label: "Sport" },
  { value: "sonstiges", label: "Sonstiges" },
] as const;

export type CategoryValue = (typeof CATEGORIES)[number]["value"];

export function categoryLabel(value: string): string {
  return CATEGORIES.find((c) => c.value === value)?.label ?? "Sonstiges";
}