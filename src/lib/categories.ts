import { translations, type Lang } from "@/lib/i18n";

export const CATEGORIES = [
  { value: "oberteile", labelKey: "categories.tops" },
  { value: "hosen", labelKey: "categories.bottoms" },
  { value: "kleider", labelKey: "categories.dresses" },
  { value: "blazer", labelKey: "categories.blazer" },
  { value: "roecke", labelKey: "categories.skirts" },
  { value: "schuhe", labelKey: "categories.shoes" },
  { value: "taschen", labelKey: "categories.bags" },
  { value: "accessoires", labelKey: "categories.accessories" },
  { value: "sport", labelKey: "categories.sport" },
  { value: "sonstiges", labelKey: "categories.other" },
] as const;

export type CategoryValue = (typeof CATEGORIES)[number]["value"];

export function categoryLabel(value: string, lang: Lang = "en"): string {
  const key = CATEGORIES.find((c) => c.value === value)?.labelKey ?? "categories.other";
  return translations[lang][key] ?? translations.en[key];
}
