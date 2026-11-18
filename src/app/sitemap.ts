import type { MetadataRoute } from "next";
import { getContent } from "@/lib/content/loader";
import { deckIds } from "@/lib/decks/load";

/**
 * Every real route, generated from the content that actually exists — a sitemap
 * written by hand goes stale the first time a topic is added.
 *
 * The base URL is configurable because the app is local-first: on a laptop it is
 * http://localhost:4310, and a sitemap is only meaningful for a public origin.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.SIGMA_PUBLIC_URL ?? "http://127.0.0.1:4310").replace(/\/$/, "");
  const now = new Date();
  const staticRoutes = ["", "/tracks", "/roadmap", "/notes", "/news", "/profile", "/lab", "/interview", "/drills", "/search", "/start", "/learn"];
  let content;
  try {
    content = getContent();
  } catch {
    content = null;
  }
  // Old /topic/ pages redirect to /learn, so list the lessons instead.
  const topics = deckIds().map((id) => `/learn/${id}`);
  const notes = content ? content.notes.map((n) => `/note/${n.id}`) : [];
  const tracks = content ? content.tracks.map((t) => `/track/${t.slug ?? t.id}`) : [];
  return [...staticRoutes, ...tracks, ...topics, ...notes].map((path) => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : path.startsWith("/learn/") ? 0.7 : 0.5,
  }));
}
