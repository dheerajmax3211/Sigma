import { LabRunner } from "@/components/LabRunner";

export const dynamic = "force-dynamic";

/**
 * Execution lab.
 *
 * A standalone page for running code without a topic, using the same sandbox
 * the topic workspace uses. Everything it reports — wall time, CPU time, peak
 * RSS, the complexity verdict, the findings — comes from the sandbox and the
 * AST profiler, never from a model.
 */
export default function LabPage() {
  return (
    <div className="mx-auto max-w-[1400px] px-5 py-8">
      <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-brand-orange">
        Code playground
      </p>
      <h1 className="text-[2rem] font-semibold tracking-[-0.02em] text-fg">Write it. Run it.</h1>
      <p className="mb-7 mt-3 max-w-3xl text-[14px] leading-relaxed text-ink-dim">
        Paste an algorithm, run it, and see what actually happened: wall-clock
        time, CPU time, peak memory, and a <em>measured</em> complexity verdict
        from the AST profiler — never a model&apos;s guess. NumPy is available.
        Nothing leaves your machine.
      </p>

      <LabRunner />
    </div>
  );
}
