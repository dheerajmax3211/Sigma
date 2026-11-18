"use client";

import { useEffect, useState } from "react";

/**
 * The honesty pill.
 *
 * It reports whether a local model is actually reachable, not whether the
 * feature exists. On a machine with no Ollama running it says so — a green
 * "AI Ready" against a dead daemon would be worse than no indicator at all.
 */
type State =
  | { kind: "loading" }
  | { kind: "ready"; model: string }
  | { kind: "off"; reason: string };

export function AiStatusPill() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/system/specs")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const ollama = d?.ollama ?? {};
        if (ollama.reachable) {
          const installed: string[] = Array.isArray(ollama.models) ? ollama.models : [];
          const primary = d?.recommendation?.primary?.label ?? "local model";
          setState({
            kind: "ready",
            model: installed[0] ?? primary,
          });
        } else {
          setState({
            kind: "off",
            reason: ollama.error ?? "Ollama is not running",
          });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "off", reason: "Could not reach the local model API" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === "loading") {
    return (
      <span className="hidden items-center gap-1.5 rounded-full border border-line bg-surface-1 px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-dimmer sm:flex">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-dimmer" />
        checking AI
      </span>
    );
  }

  if (state.kind === "ready") {
    return (
      <span
        title={`Local model ready: ${state.model} — everything stays on this machine`}
        className="hidden items-center gap-1.5 rounded-full border border-brand/40 bg-brand/10 px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.1em] text-brand sm:flex"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-brand shadow-[0_0_8px_rgba(28,214,172,0.8)]" />
        AI ready
      </span>
    );
  }

  return (
    <span
      title={`${state.reason} — install with: brew install ollama && ollama serve`}
      className="hidden items-center gap-1.5 rounded-full border border-line bg-surface-1 px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-dim sm:flex"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-ink-dimmer" />
      Local AI off
    </span>
  );
}
