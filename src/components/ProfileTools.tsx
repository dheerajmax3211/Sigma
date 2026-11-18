"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * The two controls that make a local-only record honest: take it with you, or
 * erase it.
 *
 * Export is a plain link, not a fetch-before-download dance — the API sets
 * `Content-Disposition`, so the browser saves the file and a failed request
 * surfaces as a normal navigation error instead of a half-written blob.
 *
 * Reset is two-step and the second step is typed on purpose. A button that
 * says "Delete all progress" and then deletes on the next click is a button
 * people press twice by accident; requiring the word DELETE is the difference
 * between a confirmation and a speed bump.
 */

interface ResetResponse {
  ok?: boolean;
  error?: string;
  detail?: string;
  removed?: Record<string, number>;
}

export function ProfileTools() {
  const router = useRouter();
  const [step, setStep] = useState<"idle" | "confirm" | "deleted">("idle");
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletedRows, setDeletedRows] = useState<number | null>(null);

  const canDelete = phrase === "DELETE" && !busy;

  async function deleteProgress() {
    if (!canDelete) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/progress/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      const data = (await res.json()) as ResetResponse;
      if (!res.ok) {
        throw new Error(data.detail ?? data.error ?? `Reset failed (${res.status}).`);
      }
      const removed: Record<string, number> = data.removed ?? {};
      const total = Object.values(removed).reduce((n, v) => n + v, 0);
      setDeletedRows(total);
      setPhrase("");
      setStep("deleted");
      // The profile is a server component; refresh re-reads the empty tables
      // so the page cannot keep showing rows that no longer exist.
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-9 rounded-xl border border-line bg-surface-1 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-dimmer">
            Your data
          </h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-dimmer">
            One SQLite file on this machine. No account, no sync, nothing uploaded.
          </p>
        </div>
        <a
          href="/api/progress/export"
          download
          className="shrink-0 rounded-lg border border-brand/35 bg-brand/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-brand transition hover:bg-brand/15"
        >
          Export my data
        </a>
      </div>

      <div className="mt-3.5 border-t border-line pt-3.5">
        {step === "idle" && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[12.5px] text-ink-dimmer">
              Deleting clears attempts, reviews, runs, coach sessions and interview transcripts.
            </p>
            <button
              type="button"
              onClick={() => {
                setStep("confirm");
                setError(null);
              }}
              className="shrink-0 rounded-lg border border-line-2 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim transition hover:border-brand-orange/45 hover:text-brand-orange"
            >
              Delete all progress
            </button>
          </div>
        )}

        {step === "confirm" && (
          <div className="rounded-lg border border-brand-orange/30 bg-brand-orange/[0.05] p-3.5">
            <p className="text-[12.5px] leading-relaxed text-brand-orange">
              This permanently deletes every attempt, review, code run, coach session and
              interview transcript stored by this app. It cannot be undone.
            </p>
            <label
              htmlFor="reset-confirm"
              className="mt-2.5 block font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-dimmer"
            >
              Type DELETE to confirm
            </label>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <input
                id="reset-confirm"
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void deleteProgress();
                }}
                autoComplete="off"
                spellCheck={false}
                placeholder="DELETE"
                className="w-36 rounded-lg border border-line-2 bg-surface-2 px-2.5 py-1.5 font-mono text-[12px] text-fg outline-none placeholder:text-ink-dimmer/60 focus:border-brand-orange/50"
              />
              <button
                type="button"
                onClick={() => void deleteProgress()}
                disabled={!canDelete}
                className="rounded-lg border border-brand-orange/50 bg-brand-orange/15 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-brand-orange transition enabled:hover:bg-brand-orange/25 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? "Deleting…" : "Delete everything"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep("idle");
                  setPhrase("");
                  setError(null);
                }}
                disabled={busy}
                className="rounded-lg border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dimmer transition hover:text-ink-dim disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
            {error && (
              <p role="alert" className="mt-2 text-[12px] text-brand-orange">
                {error}
              </p>
            )}
          </div>
        )}

        {step === "deleted" && (
          <p aria-live="polite" className="text-[12.5px] text-ink-dim">
            {deletedRows === 0
              ? "Nothing was stored, so nothing changed."
              : `Deleted ${deletedRows ?? 0} row${deletedRows === 1 ? "" : "s"}. The record above is now empty.`}
          </p>
        )}
      </div>
    </section>
  );
}
