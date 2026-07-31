import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = new URL(process.env.APP_URL ?? "http://localhost:3000");

  return [
    {
      url: siteUrl.toString(),
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
      images: [new URL("/hero.png", siteUrl).toString()],
    },
  ];
}
