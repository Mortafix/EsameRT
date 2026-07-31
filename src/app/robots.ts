import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = new URL(process.env.APP_URL ?? "http://localhost:3000");
  const production = process.env.NODE_ENV === "production";

  return {
    rules: {
      userAgent: "*",
      allow: production ? "/" : undefined,
      disallow: production
        ? [
            "/api/",
            "/admin/",
            "/dashboard/",
            "/quiz/",
            "/ripasso/",
            "/statistiche/",
            "/storico/",
          ]
        : "/",
    },
    sitemap: new URL("/sitemap.xml", siteUrl).toString(),
    host: siteUrl.origin,
  };
}
