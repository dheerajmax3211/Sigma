import Link from "next/link";
import { getDb } from "@/lib/db";
import { ensureLearner } from "@/lib/progress/mastery";
import { buildProfile } from "@/lib/progress/achievements";
import { dueForReview, type DueTopic } from "@/lib/progress/due";
import { getContent } from "@/lib/content/loader";
import { ProfileTools } from "@/components/ProfileTools";

export const dynamic = "force-dynamic";

/** How many due topics to list before collapsing into a "+N more" line. */
const DUE_SHOWN = 8;

/** Small label for a due row: what the schedule says, in plain words. */
function dueLabel(d: DueTopic): { text: string; tone: string } {
  if (d.overdueDays === null) return { text: "not yet reviewed", tone: "text-ink-dimmer" };
  if (d.overdueDays === 0) return { text: "due today", tone: "text-brand" };
  if (d.overdueDays === 1) return { text: "1 day late", tone: "text-brand-orange" };
  return { text: `${d.overdueDays} days late`, tone: "text-brand-orange" };
}

/**
 * The learner's record.
 *
 * A solo learner has no cohort and no manager, so this page is the only place
 * that says "you are making progress" — which is exactly why it must be derived
 * from real rows rather than a decorative counter.
 *
 * It leads with the review queue rather than the badge count: on day one the
 * badge grid reads "0/9", which is a failure message for someone who has not
 * started yet. "Nothing attempted yet" plus one link is the honest version.
 */
export default async function ProfilePage() {
  const db = getDb();
  const learnerId = ensureLearner(db);
  const stats = buildProfile(db, learnerId);
  const due = dueForReview(db, learnerId);
  const content = getContent();
  const trackTitle = new Map(content.tracks.map((t) => [t.id, t.title]));

  const unlocked = stats.achievements.filter((a) => a.unlocked).length;
  const untouched = stats.topicsTouched === 0;
  // The corpus is ordered by track then position, so this is the curriculum's
  // actual first step — the same one the catalog renders first.
  const firstTopic = content.topics[0] ?? null;
  const shownDue = due.topics.slice(0, DUE_SHOWN);
  const hiddenDue = due.count - shownDue.length;

  return (
    <div className="mx-auto max-w-[1100px] px-5 py-10">
      <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-brand">Profile</p>
      <h1 className="text-[2rem] font-semibold tracking-[-0.02em] text-fg">Your record</h1>
      <p className="mt-1.5 font-mono text-[12.5px] text-ink-dimmer">
        {untouched
          ? "Nothing attempted yet · everything is local"
          : `${unlocked}/${stats.achievements.length} achievements · everything is local`}
      </p>

      <section className="mt-7 overflow-hidden rounded-xl border border-line bg-surface-1">
        <div className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-2.5">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-dimmer">
            Due for review
          </h2>
          <span className="font-mono text-[11px] text-ink-dimmer">
            {due.count === 0 ? "none" : `${due.count} topic${due.count === 1 ? "" : "s"}`}
          </span>
        </div>

        {due.count === 0 ? (
          <p className="px-4 py-3.5 text-[13px] leading-relaxed text-ink-dim">
            Nothing is due today —{" "}
            <Link
              href="/tracks"
              className="text-brand underline decoration-brand/40 underline-offset-2 transition hover:decoration-brand"
            >
              browse the curriculum
            </Link>{" "}
            to start something new.
          </p>
        ) : (
          <ul>
            {shownDue.map((d) => {
              const label = dueLabel(d);
              return (
                <li key={d.topicId} className="border-t border-line first:border-t-0">
                  <Link
                    href={`/topic/${d.topicId}`}
                    className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-surface-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-[13.5px] text-fg">
                      {d.title}
                    </span>
                    <span className="shrink-0 font-mono text-[10.5px] text-ink-dimmer">
                      {Math.round(d.mastery * 100)}%
                    </span>
                    <span
                      className={`w-28 shrink-0 text-right font-mono text-[10.5px] uppercase tracking-[0.06em] ${label.tone}`}
                    >
                      {label.text}
                    </span>
                  </Link>
                </li>
              );
            })}
            {hiddenDue > 0 && (
              <li className="border-t border-line px-4 py-2 font-mono text-[11px] text-ink-dimmer">
                +{hiddenDue} more due
              </li>
            )}
          </ul>
        )}
      </section>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Streak"
          value={`${stats.streakDays}d`}
          accent="text-brand"
          hint="Counts a day you open a topic or finish an interview."
        />
        <Stat label="Topics touched" value={String(stats.topicsTouched)} accent="text-fg" />
        <Stat label="Mastered" value={String(stats.topicsMastered)} accent="text-fg" />
        <Stat
          label="Best interview"
          value={stats.bestInterviewScore === null ? "—" : String(stats.bestInterviewScore)}
          accent="text-brand-orange"
        />
      </div>

      <section className="mt-9">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-dimmer">
            Achievements
          </h2>
          <span className="font-mono text-[11px] text-ink-dimmer">
            {unlocked}/{stats.achievements.length}
          </span>
        </div>

        {untouched && firstTopic && (
          <div className="mb-3 rounded-xl border border-brand/25 bg-brand/[0.04] px-4 py-3.5">
            <p className="text-[14px] font-semibold text-fg">Nothing attempted yet</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-dim">
              Badges are derived from real work, not logins — the first one unlocks the moment
              you open a topic.
            </p>
            <Link
              href={`/topic/${firstTopic.id}`}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-brand/35 bg-brand/10 px-3 py-1.5 text-[12.5px] font-semibold text-brand transition hover:bg-brand/15"
            >
              Start with {firstTopic.title} <span aria-hidden>→</span>
            </Link>
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {stats.achievements.map((a) => (
            <div
              key={a.id}
              className={`rounded-xl border p-4 ${
                a.unlocked ? "border-brand/35 bg-brand/[0.05]" : "border-line bg-surface-1"
              }`}
            >
              <div className="flex items-start gap-2">
                <span className={`font-mono text-[12px] ${a.unlocked ? "text-brand" : "text-ink-dimmer"}`}>
                  {a.unlocked ? "◆" : "◇"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className={`text-[13.5px] font-semibold ${a.unlocked ? "text-fg" : "text-ink-dim"}`}>
                    {a.title}
                  </div>
                  <div className="mt-0.5 text-[12px] leading-relaxed text-ink-dimmer">
                    {a.requirement}
                  </div>
                </div>
              </div>
              {!a.unlocked && a.progress > 0 && (
                <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-surface-4">
                  <div
                    className="h-full rounded-full bg-brand/60"
                    style={{ width: `${Math.round(a.progress * 100)}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-9">
        <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-dimmer">
          By track
        </h2>
        <div className="overflow-hidden rounded-xl border border-line">
          {stats.perTrack.map((t, i) => {
            const pct = t.total === 0 ? 0 : Math.round((t.mastered / t.total) * 100);
            return (
              <div
                key={t.trackId}
                className={`flex items-center gap-4 bg-surface-1 px-4 py-3 ${
                  i > 0 ? "border-t border-line" : ""
                }`}
              >
                <span className="min-w-0 flex-1 truncate text-[13.5px] text-fg">
                  {trackTitle.get(t.trackId) ?? t.trackId}
                </span>
                <div className="hidden h-1.5 w-32 overflow-hidden rounded-full bg-surface-4 sm:block">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-20 shrink-0 text-right font-mono text-[11px] text-ink-dimmer">
                  {t.mastered}/{t.total}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-9 grid gap-3 sm:grid-cols-3">
        <Stat label="Mock interviews" value={String(stats.interviewsCompleted)} accent="text-fg" />
        <Stat
          label="Average score"
          value={stats.averageInterviewScore === null ? "—" : String(stats.averageInterviewScore)}
          accent="text-fg"
        />
        <Stat
          label="Code runs"
          value={`${stats.problemsPassed}/${stats.problemsRun}`}
          accent="text-fg"
        />
      </section>

      <ProfileTools />
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  hint,
}: {
  label: string;
  value: string;
  accent: string;
  /** Optional one-line definition, e.g. what a streak day actually is. */
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface-1 px-4 py-3.5">
      <div className={`font-mono text-[22px] font-bold tracking-tight ${accent}`}>{value}</div>
      <div className="mt-0.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-dimmer">
        {label}
      </div>
      {hint && <div className="mt-1 text-[10.5px] leading-snug text-ink-dimmer">{hint}</div>}
    </div>
  );
}
