import { InterviewConsole } from "@/components/InterviewConsole";

export const dynamic = "force-dynamic";

/**
 * Mock technical interview.
 *
 * A staged oral interview: clarify → approach → complexity → production edge
 * cases, scored against an explicit rubric at each stage. The `interview_session`
 * and `interview_turn` tables were created in the first migration and were never
 * written to until this page existed.
 */
export default function InterviewPage() {
  return (
    <div className="mx-auto max-w-[1100px] px-5 py-8">
      <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-brand">
        Mock interview
      </p>
      <h1 className="text-[2rem] font-semibold tracking-[-0.02em] text-fg">
        Four rounds, just like the real thing
      </h1>
      <p className="mb-7 mt-3 max-w-2xl text-[14px] leading-relaxed text-ink-dim">
        Constrain it, solve it, justify it, break it. You answer, then you score
        yourself against the same rubric an interviewer holds — so a good answer
        phrased your own way counts, and a pile of buzzwords does not.
      </p>

      <InterviewConsole />
    </div>
  );
}
