import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = (process.env.SIGMA_PUBLIC_URL ?? "http://127.0.0.1:4310").replace(/\/$/, "");
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
