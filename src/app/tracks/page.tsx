import { getContent } from "@/lib/content/loader";

export const dynamic = "force-dynamic";

/**
 * The full catalogue.
 *
 * This page exists because the home page was carrying all 78 topic summaries —
 * 5,487 visible words on the front door. The landing page now answers "where do
 * I start"; the catalogue answers "what is in here".
 */
export default async function TracksPage() {
  const content = getContent();
  const totalMinutes = content.topics.reduce((n, t) => n + t.estMinutes, 0);

  return (
    <div className="mx-auto max-w-[1100px] px-5 py-10">
      <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-brand">
        Catalogue
      </p>
      <h1 className="text-[2rem] font-semibold tracking-[-0.02em] text-fg">All tracks</h1>
      <p className="mt-1.5 font-mono text-[12.5px] text-ink-dimmer">
        {content.tracks.length} tracks · {content.topics.length} topics ·{" "}
        {Math.round(totalMinutes / 60)} hours of study
      </p>

      <div className="mt-8 flex flex-col gap-10">
        {content.tracks.map((track) => {
          const key = track.slug.replace(/^\d+-/, "");
          const topics = content.topicsByTrack.get(key) ?? [];
          return (
            <section key={track.id}>
              <div className="mb-3 flex items-baseline justify-between gap-4">
                <div>
                  <a
                    href={`/track/${track.slug}`}
                    className="text-[17px] font-semibold tracking-tight text-fg hover:text-brand"
                  >
                    {track.title}
                  </a>
                  {track.subtitle && (
                    <p className="mt-0.5 text-[13px] text-ink-dim">{track.subtitle}</p>
                  )}
                </div>
                <span className="shrink-0 font-mono text-[11px] text-ink-dimmer">
                  {topics.length} topic{topics.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="overflow-hidden rounded-xl border border-line">
                {topics.map((t, i) => (
                  <a
                    key={t.id}
                    href={`/topic/${t.id}`}
                    className={`flex items-center gap-4 bg-surface-1 px-4 py-2.5 transition hover:bg-surface-2 ${
                      i > 0 ? "border-t border-line" : ""
                    }`}
                  >
                    <span className="w-6 shrink-0 font-mono text-[10.5px] text-ink-dimmer">
                      {String(t.position).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13.5px] text-fg">
                      {t.title}
                    </span>
                    <span className="hidden shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-dimmer sm:block">
                      {t.difficulty}
                    </span>
                    <span className="shrink-0 font-mono text-[10.5px] text-ink-dimmer">
                      {t.estMinutes}m
                    </span>
                  </a>
                ))}
                {topics.length === 0 && (
                  <div className="bg-surface-1 px-4 py-3 text-[13px] text-ink-dimmer">
                    No topics in this track yet.
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
