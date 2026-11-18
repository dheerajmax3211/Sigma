"use client";

import { useCallback, useEffect, useState } from "react";
import { Markdown, CodeEditor } from "@/components/CodeEditor";

/**
 * The hint ladder.
 *
 * This is the component that makes Nexus different from a chatbot. The learner
 * sees five rungs. Asking for a rung costs nothing but attention, and the
 * ladder never jumps ahead of itself. Crucially, the ladder is *server
 * enforced* — a client cannot request the solution without revealing every
 * tier beneath it.
 */
export function HintLadder({
  topicId,
  sessionId,
  onSessionId,
  code,
  language,
}: {
  topicId: string;
  sessionId: string | null;
  onSessionId: (id: string) => void;
  code?: string;
  language?: string;
}) {
  const [revealed, setRevealed] = useState<Record<number, HintPayload>>({});
  const [revealedTier, setRevealedTier] = useState(0);
  const [busy, setBusy] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [degraded, setDegraded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tiers = [
    { tier: 1, label: "Concept", blurb: "What is actually going on here." },
    { tier: 2, label: "Direction", blurb: "Which technique to reach for." },
    { tier: 3, label: "Pseudocode", blurb: "The shape of the solution." },
    { tier: 4, label: "Derivation", blurb: "The mathematics, worked out." },
    { tier: 5, label: "Full Solution", blurb: "A complete reference implementation." },
  ];

  const ask = useCallback(
    async (tier: number) => {
      setBusy(tier);
      setError(null);
      try {
        const res = await fetch("/api/coach/hint", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sessionId: sessionId ?? undefined,
            topicId,
            tier,
            learnerText: note || undefined,
            code,
            language,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "The coach could not respond.");
          return;
        }
        if (data.sessionId && !sessionId) onSessionId(data.sessionId);
        setRevealed((prev) => ({ ...prev, [tier]: data as HintPayload }));
        setRevealedTier(data.revealedTier ?? tier);
        setDegraded(data.degraded ? (data.reason ?? "Model unavailable.") : null);
        setNote("");
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(null);
      }
    },
    [sessionId, topicId, note, code, language, onSessionId],
  );

  return (
    <div className="flex flex-col gap-3">
      {/* ── Ladder ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        {tiers.map((t) => {
          const unlocked = t.tier <= revealedTier + 1;
          const shown = Boolean(revealed[t.tier]);
          return (
            <div
              key={t.tier}
              className={`rounded-xl border px-3.5 py-2.5 transition ${
                shown
                  ? "border-brand/30 bg-brand/[0.05]"
                  : unlocked
                    ? "border-line bg-surface-1 hover:border-line-2"
                    : "border-line/50 bg-surface-1/40 opacity-55"
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-md font-mono text-[11px] font-bold ${
                    shown ? "bg-brand/20 text-brand" : "bg-surface-3 text-ink-dimmer"
                  }`}
                >
                  {t.tier}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium text-fg">{t.label}</span>
                  <span className="block truncate text-[12px] text-ink-dimmer">{t.blurb}</span>
                </span>
                {!shown && (
                  <button
                    onClick={() => ask(t.tier)}
                    disabled={!unlocked || busy !== null}
                    className={`shrink-0 rounded-lg px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] transition ${
                      unlocked
                        ? "bg-surface-3 text-fg hover:bg-surface-4"
                        : "cursor-not-allowed bg-surface-2 text-ink-dimmer"
                    }`}
                  >
                    {busy === t.tier ? "asking…" : unlocked ? "reveal" : "locked"}
                  </button>
                )}
              </div>

              {shown && revealed[t.tier] && (
                <div className="mt-3 animate-rise">
                  <Markdown source={revealed[t.tier].content} />
                  {revealed[t.tier].blocks?.map((b, i) => (
                    <BlockView key={i} block={b} />
                  ))}
                  {revealed[t.tier].checkpoint && (
                    <div className="mt-3 rounded-lg border border-brand-orange/30 bg-brand-orange/[0.07] px-3.5 py-2.5">
                      <div className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-brand-orange">
                        Self-check
                      </div>
                      <p className="text-[13px] leading-relaxed text-fg">
                        {revealed[t.tier].checkpoint}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {degraded && (
        <p className="rounded-lg border border-brand-orange/30 bg-brand-orange/[0.07] px-3 py-2 font-mono text-[11.5px] text-brand-orange">
          Offline coach in use — {degraded}
        </p>
      )}
      {error && (
        <p className="rounded-lg border border-brand-pink/30 bg-brand-pink/[0.07] px-3 py-2 font-mono text-[11.5px] text-brand-pink">
          {error}
        </p>
      )}

      {/* ── Ask ──────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-line bg-surface-1 p-3">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What are you stuck on? (Optional — the coach uses it to be specific.)"
          aria-label="What are you stuck on?"
          rows={2}
          className="w-full resize-none bg-transparent text-[13.5px] leading-relaxed text-fg outline-none placeholder:text-ink-dimmer"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="font-mono text-[10.5px] text-ink-dimmer">
            {revealedTier}/5 revealed
          </span>
          <button
            onClick={() => ask(Math.min(revealedTier + 1, 5))}
            disabled={busy !== null || revealedTier >= 5}
            className="rounded-lg bg-brand px-3.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-bg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy !== null ? "asking…" : "next hint"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface HintPayload {
  tier: number;
  label: string;
  content: string;
  checkpoint?: string;
  blocks?: { kind: string; language?: string; body: string }[];
}

function BlockView({ block }: { block: { kind: string; language?: string; body: string } }) {
  if (block.kind === "math") {
    return (
      <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-surface-2 px-4 py-3">
        <Markdown source={block.body} />
      </div>
    );
  }
  if (block.kind === "code" || block.kind === "pseudocode") {
    return (
      <pre className="mt-3 overflow-x-auto rounded-xl border border-line bg-surface-1 px-4 py-3 font-mono text-[12.5px] leading-relaxed text-fg">
        <code>{block.body}</code>
      </pre>
    );
  }
  if (block.kind === "checklist") {
    return (
      <ul className="mt-3 flex flex-col gap-1 rounded-xl border border-line bg-surface-2 px-4 py-3">
        {block.body.split("\n").filter(Boolean).map((line, i) => (
          <li key={i} className="flex gap-2.5 text-[13px] text-ink-dim">
            <span className="text-brand">▸</span>
            <span className="font-mono text-[12px]">{line}</span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <p className="mt-3 rounded-xl border border-brand-orange/30 bg-brand-orange/[0.07] px-4 py-3 text-[13px] leading-relaxed text-brand-orange">
      {block.body}
    </p>
  );
}
