import { notFound } from "next/navigation";
import { getContent } from "@/lib/content/loader";
import { InlineMath } from "@/components/CodeEditor";

export const dynamic = "force-dynamic";

export default async function TrackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const content = getContent();
  const track = content.tracks.find(
    (t) => t.slug === id || t.slug.replace(/^\d+-/, "") === id || t.id === id,
  );
  // An unknown slug used to render 200 with "This track is being written",
  // which is a lie: the track does not exist, it is not unfinished.
  if (!track) notFound();
  const topics = content.topicsByTrack.get(track.id) ?? [];

  return (
    <div className="mx-auto max-w-[1100px] px-5 py-10">
      <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-brand">
        Track {track ? `· tier ${track.tier}` : ""}
      </p>
      <h1 className="text-[2rem] font-semibold tracking-[-0.02em] text-fg">
        {track?.title ?? id}
      </h1>
      {track?.subtitle && (
        <p className="mt-1.5 font-mono text-[13px] text-brand/80">{track.subtitle}</p>
      )}
      {track?.description && (
        <p className="mt-4 max-w-2xl text-[14.5px] leading-relaxed text-ink-dim">
          {track.description}
        </p>
      )}

      {track && track.outcomes.length > 0 && (
        <section className="mt-8 rounded-2xl border border-line bg-surface-1 p-5">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand">
            By the end of this track you can
          </h2>
          <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {track.outcomes.map((o) => (
              <li key={o} className="flex gap-2.5 text-[13.5px] leading-relaxed text-ink-dim">
                <span className="mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand/60" />
                <span>
                  <InlineMath source={o} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-8 overflow-hidden rounded-2xl border border-line">
        {topics.length === 0 && (
          <p className="bg-surface-1 px-5 py-8 text-center font-mono text-[12px] text-ink-dimmer">
            This track is being written.
          </p>
        )}
        {topics.map((t, i) => (
          <a
            key={t.id}
            href={`/topic/${t.id}`}
            className={`flex items-start gap-4 bg-surface-1 px-5 py-4 transition hover:bg-surface-2 ${
              i > 0 ? "border-t border-line" : ""
            }`}
          >
            <span className="mt-0.5 w-6 shrink-0 font-mono text-[11px] text-ink-dimmer">
              {String(t.position).padStart(2, "0")}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14.5px] font-medium text-fg">{t.title}</span>
              <span className="mt-0.5 block text-[13px] leading-relaxed text-ink-dimmer">
                <InlineMath source={t.summary} />
              </span>
            </span>
            <span className="shrink-0 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-dimmer">
              {t.difficulty}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
