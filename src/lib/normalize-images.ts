import { supabase } from "@/integrations/supabase/client";
import { signedUrl } from "@/lib/storage";

type SmoothFn = (opts: {
  data: { imageDataUrl: string; category?: string; view?: "top" | "side" };
}) => Promise<{ b64: string }>;

export type NormalizableItem = {
  id: string;
  image_url: string;
  category: string;
};

async function toDataUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob();
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

async function uploadB64(uid: string, b64: string) {
  const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
  const path = `${uid}/${crypto.randomUUID()}.png`;
  const { error } = await supabase.storage
    .from("wardrobe")
    .upload(path, blob, { contentType: "image/png" });
  if (error) throw error;
  return path;
}

/**
 * Erzeugt die KI-Bilder eines Teils im einheitlichen Standard-Format neu:
 * alle Teile flach von oben, Schuhe zusätzlich mit Seitenansicht als 2. Bild.
 */
export async function normalizeItemImages(item: NormalizableItem, smooth: SmoothFn) {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error("Nicht angemeldet");

  const src = await toDataUrl(await signedUrl(item.image_url));

  const top = await smooth({ data: { imageDataUrl: src, category: item.category, view: "top" } });
  const aiPath = await uploadB64(uid, top.b64);

  let aiPath2: string | null = null;
  if (item.category === "schuhe") {
    const side = await smooth({ data: { imageDataUrl: src, category: item.category, view: "side" } });
    aiPath2 = await uploadB64(uid, side.b64);
  }

  const { error } = await supabase
    .from("wardrobe_items")
    .update({ ai_image_url: aiPath, ai_image_url_2: aiPath2, use_ai_image: true })
    .eq("id", item.id);
  if (error) throw error;
  return { aiPath, aiPath2 };
}