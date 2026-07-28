import { supabase } from "@/integrations/supabase/client";

export async function signedUrl(path: string, expires = 60 * 60) {
  const { data, error } = await supabase.storage.from("wardrobe").createSignedUrl(path, expires);
  if (error) throw error;
  return data.signedUrl;
}

export async function signedUrlsMap(paths: string[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(paths.filter(Boolean)));
  if (unique.length === 0) return {};
  const { data, error } = await supabase.storage.from("wardrobe").createSignedUrls(unique, 60 * 60);
  if (error) throw error;
  const map: Record<string, string> = {};
  data?.forEach((d, i) => {
    if (d.signedUrl) map[unique[i]] = d.signedUrl;
  });
  return map;
}