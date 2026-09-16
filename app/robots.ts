import type { MetadataRoute } from "next";
import { canonicalSiteUrl } from "@/lib/site-config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: "/field-interest/"
      }
    ],
    sitemap: `${canonicalSiteUrl}/sitemap.xml`
  };
}
