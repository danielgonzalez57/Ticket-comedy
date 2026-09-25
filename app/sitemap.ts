import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const supabase = await createClient();
  const { data: shows } = await supabase
    .from("shows_public")
    .select("id")
    .eq("status", "published");

  return [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/shows`, changeFrequency: "daily", priority: 0.8 },
    ...(shows ?? []).map((s) => ({
      url: `${base}/shows/${s.id}`,
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
  ];
}
