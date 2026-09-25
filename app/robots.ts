import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/constants";

// Only the public catalogue is indexable; admin, orders, tickets and the
// customer area are private (they carry order ids / QR tokens).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api", "/orders", "/tickets", "/mis-entradas"],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
