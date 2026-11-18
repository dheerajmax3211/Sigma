"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SystemSpecs } from "@/lib/system/detector";
import { fitsOnDisk, type ModelEntry, type Recommendation } from "@/lib/system/models";

/**
 * The mascot.
 *
 * A floating panel that answers three questions before it asks for anything:
 * what machine is this, which local model fits it, and is that model here yet.
 * It exists so the "local-first" promise is visible rather than buried in a
 * settings page.
 *
 * Two rules it does not break:
 *  1. It never invents model output. If no local model is installed, the chat
 *     says so instead of answering.
 *  2. It talks only to this app's own routes, which talk only to 127.0.0.1.
 */

interface OllamaStatus {
  reachable: boolean;
  version: string | null;
  models: string[];
  error?: string;
}

interface ChatEntry {
  id: number;
  role: "user" | "assistant";
  content: string;
  /** Muted footer, e.g. a degraded-path reason. */
  meta?: string;
}

const INSTALL_COMMAND = "brew install ollama && ollama serve";
const NOT_MODEL_NOTICE = "Local model not connected yet — install above to enable.";

const QUICK_ACTIONS: { label: string; prompt: string }[] = [
  { label: "Explain this formula", prompt: "Explain the key formula on this page, step by step." },
  { label: "Quiz me on this topic", prompt: "Quiz me on this topic — one question at a time." },
  { label: "Review my code", prompt: "Review my code and name the first thing to fix." },
];

function isInstalled(models: string[] | undefined, id: string): boolean {
  if (!models?.length) return false;
  const normalise = (t: string) => t.replace(/:latest$/, "");
  return models.some((m) => normalise(m) === normalise(id));
}

function gbFromBytes(bytes: number): string {
  return `${(bytes / 1e9).toFixed(1)} GB`;
}

/** One NDJSON progress event from Ollama, rendered as a single log line. */
function formatPullEvent(event: unknown): string | null {
  const e = event as {
    status?: unknown;
    error?: unknown;
    total?: unknown;
    completed?: unknown;
  };
  if (typeof e?.error === "string" && e.error.trim()) return `error: ${e.error}`;
  if (typeof e?.status !== "string" || !e.status.trim()) return null;
  const { total, completed } = e;
  if (typeof total === "number" && typeof completed === "number" && total > 0) {
    const pct = Math.min(100, Math.round((completed / total) * 100));
    return `${e.status} — ${pct}% (${gbFromBytes(completed)} / ${gbFromBytes(total)})`;
  }
  return e.status;
}

function Stat({
  label,
  value,
  hint,
  wide,
}: {
  label: string;
  value: string;
  hint?: string;
  wide?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border border-line bg-surface-2/70 px-2.5 py-1.5 ${wide ? "col-span-2" : ""}`}
    >
      <div className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-dimmer">{label}</div>
      <div className="truncate font-mono text-[11.5px] text-fg" title={value}>
        {value}
      </div>
      {hint ? <div className="font-mono text-[9.5px] text-ink-dimmer">{hint}</div> : null}
    </div>
  );
}

export function MascotAssistant({
  context,
  defaultOpen = false,
}: {
  context?: { topicId?: string; title?: string };
  /** Open on mount — useful when a page deep-links into a specific question. */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [specs, setSpecs] = useState<SystemSpecs | null>(null);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [ollama, setOllama] = useState<OllamaStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [copied, setCopied] = useState(false);

  const [pulling, setPulling] = useState(false);
  const [pullLog, setPullLog] = useState<string[]>([]);

  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const loadedRef = useRef(false);
  const sessionRef = useRef<string | null>(null);
  const seqRef = useRef(0);
  const logEndRef = useRef<HTMLDivElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const hasModel = Boolean(
    ollama?.reachable && recommendation && isInstalled(ollama.models, recommendation.primary.id),
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/system/specs", { cache: "no-store" });
      const data = (await res.json()) as {
        specs?: SystemSpecs;
        recommendation?: Recommendation;
        ollama?: OllamaStatus;
        error?: string;
      };
      if (!res.ok || !data.specs || !data.recommendation) {
        throw new Error(data?.error ?? `Could not read system specs (HTTP ${res.status}).`);
      }
      setSpecs(data.specs);
      setRecommendation(data.recommendation);
      setOllama(data.ollama ?? { reachable: false, version: null, models: [] });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not read system specs.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Detection is lazy: the first open pays for the probe, not every page view.
  useEffect(() => {
    if (!open || loadedRef.current) return;
    loadedRef.current = true;
    void refresh();
  }, [open, refresh]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages, sending]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [pullLog]);

  const append = useCallback((role: ChatEntry["role"], content: string, meta?: string) => {
    seqRef.current += 1;
    const id = seqRef.current;
    setMessages((prev) => [...prev, { id, role, content, meta }]);
  }, []);

  /**
   * Chat.
   *
   * `/api/coach/hint` is the only coach endpoint this app has, and it takes a
   * tier plus the learner's text — there is no messages array and no system
   * field. Page context is therefore folded into `learnerText`, which is where
   * it actually reaches the prompt builder. If no local model is installed we
   * do not call it at all and say so plainly: a fabricated answer is worse
   * than an honest gap.
   */
  const send = useCallback(
    async (override?: string) => {
      const text = (override ?? input).trim();
      if (!text || sending) return;

      setInput("");
      append("user", text);

      if (!hasModel) {
        append("assistant", NOT_MODEL_NOTICE);
        return;
      }

      const contextLine = context?.title
        ? `[Page context: ${context.title}${context.topicId ? ` (${context.topicId})` : ""}]`
        : context?.topicId
          ? `[Page context: topic ${context.topicId}]`
          : "";
      const learnerText = contextLine ? `${contextLine}\n\n${text}` : text;

      setSending(true);
      try {
        const res = await fetch("/api/coach/hint", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sessionId: sessionRef.current ?? undefined,
            topicId: context?.topicId,
            tier: 1,
            learnerText,
          }),
        });
        const data = (await res.json().catch(() => null)) as {
          sessionId?: string;
          content?: string;
          degraded?: boolean;
          reason?: string;
          error?: string;
        } | null;

        if (!res.ok) {
          append("assistant", `The coach could not answer: ${data?.error ?? `HTTP ${res.status}`}.`);
          return;
        }
        if (data?.sessionId) sessionRef.current = data.sessionId;
        const content = data?.content?.trim();
        if (!content) {
          append("assistant", "The coach returned an empty response.");
          return;
        }
        append("assistant", content, data?.degraded ? (data.reason ?? "model unavailable") : undefined);
      } catch (err) {
        append("assistant", `Could not reach the coach: ${(err as Error).message}`);
      } finally {
        setSending(false);
      }
    },
    [append, context, hasModel, input, sending],
  );

  const pull = useCallback(
    async (model: ModelEntry) => {
      setPulling(true);
      setPullLog([`Pulling ${model.id} (~${model.approxDiskGb} GB)…`]);
      let last = "";
      const push = (line: string) => {
        if (!line || line === last) return;
        last = line;
        setPullLog((prev) => [...prev.slice(-60), line]);
      };

      try {
        const res = await fetch("/api/system/pull", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ model: model.id }),
        });

        if (!res.ok) {
          const detail = (await res.json().catch(() => null)) as
            | { error?: string; command?: string }
            | null;
          push(detail?.error ?? `Pull failed (HTTP ${res.status}).`);
          if (detail?.command) push(detail.command);
          return;
        }
        if (!res.body) {
          push("The local daemon returned no progress stream.");
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const rendered = formatPullEvent(JSON.parse(trimmed));
              if (rendered) push(rendered);
            } catch {
              push(trimmed.slice(0, 200));
            }
          }
        }
        if (buffer.trim()) {
          try {
            const rendered = formatPullEvent(JSON.parse(buffer));
            if (rendered) push(rendered);
          } catch {
            push(buffer.trim().slice(0, 200));
          }
        }
        push("Pull stream closed.");
      } catch (err) {
        push(`Pull interrupted: ${(err as Error).message}`);
      } finally {
        setPulling(false);
        void refresh();
      }
    },
    [refresh],
  );

  const copyCommand = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_COMMAND);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (insecure context) — the command stays selectable.
    }
  }, []);

  const ready = Boolean(ollama?.reachable);
  const installed = recommendation ? isInstalled(ollama?.models, recommendation.primary.id) : false;
  const diskShort =
    recommendation && specs?.freeDiskGb != null
      ? !fitsOnDisk(recommendation.primary, specs.freeDiskGb)
      : false;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "Close the local AI assistant" : "Open the local AI assistant"}
        title="Local AI assistant"
        className="fixed bottom-5 right-5 z-50 grid h-12 w-12 place-items-center rounded-full bg-brand font-mono text-lg font-bold text-bg shadow-[0_10px_30px_-8px_rgba(28,214,172,0.65)] ring-1 ring-brand/40 transition hover:brightness-110 active:scale-95"
      >
        ◈
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Local AI assistant"
          className="fixed bottom-24 right-5 z-50 flex max-h-[70vh] w-[380px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-line bg-surface-1 shadow-[0_30px_80px_-24px_rgba(0,0,0,0.95)] animate-rise"
        >
          {/* ── Header ─────────────────────────────────────────────── */}
          <div className="flex items-center gap-2.5 border-b border-line px-3.5 py-2.5">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand/15 font-mono text-[12px] font-bold text-brand ring-1 ring-brand/25">
              ◈
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-fg">
                Mascot
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${ready ? "bg-brand" : "bg-brand-orange"}`}
                />
                <span className={`text-[11px] ${ready ? "text-brand" : "text-ink-dim"}`}>
                  {ready ? "AI Ready" : "Local AI not connected"}
                </span>
                {ollama?.version ? (
                  <span className="font-mono text-[9.5px] text-ink-dimmer">v{ollama.version}</span>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="grid h-6 w-6 place-items-center rounded-md text-ink-dimmer transition hover:bg-surface-3 hover:text-fg"
            >
              ×
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3.5 py-3">
            {loadError ? (
              <div className="mb-3 rounded-lg border border-brand-orange/40 bg-brand-orange/10 px-2.5 py-2 text-[11.5px] text-brand-orange">
                {loadError}
                <button
                  type="button"
                  onClick={() => void refresh()}
                  className="ml-2 font-mono text-[10px] uppercase tracking-[0.08em] underline"
                >
                  retry
                </button>
              </div>
            ) : null}

            {/* ── This machine ─────────────────────────────────────── */}
            <div className="mb-1 flex items-center justify-between">
              <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-dimmer">
                This machine
              </span>
              <button
                type="button"
                onClick={() => void refresh()}
                disabled={loading}
                className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-ink-dimmer transition hover:text-brand disabled:opacity-50"
              >
                {loading ? "scanning…" : "rescan"}
              </button>
            </div>

            {specs ? (
              <div className="grid grid-cols-2 gap-1.5">
                <Stat
                  wide
                  label={specs.isAppleSilicon ? "Apple Silicon" : "CPU"}
                  value={specs.chip ?? specs.cpuModel}
                  hint={`${specs.arch} · ${specs.platform}`}
                />
                <Stat label="Cores" value={String(specs.cores)} />
                <Stat
                  label="Memory"
                  value={`${specs.totalRamGb} GB`}
                  hint={`${specs.freeRamGb} GB free`}
                />
                <Stat
                  label="Disk free"
                  value={specs.freeDiskGb == null ? "unknown" : `${specs.freeDiskGb} GB`}
                  hint={specs.freeDiskGb == null ? "not readable" : "home volume"}
                />
                <Stat
                  label="Installed"
                  value={ollama?.reachable ? String(ollama.models.length) : "—"}
                  hint={ollama?.reachable ? "local models" : "daemon offline"}
                />
              </div>
            ) : (
              <div className="rounded-lg border border-line bg-surface-2/60 px-2.5 py-3 text-[11.5px] text-ink-dimmer">
                {loading ? "Scanning this machine…" : "No hardware report yet."}
              </div>
            )}

            {/* ── Recommendation ───────────────────────────────────── */}
            {recommendation ? (
              <div className="mt-3 rounded-xl border border-line bg-surface-2 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-dimmer">
                    Recommended
                  </span>
                  <span className="font-mono text-[9.5px] text-ink-dimmer">
                    {recommendation.primary.quant}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-baseline gap-2">
                  <span className="text-[14px] font-semibold text-fg">
                    {recommendation.primary.label}
                  </span>
                  <span className="font-mono text-[11px] text-brand">
                    ~{recommendation.primary.approxDiskGb} GB
                  </span>
                  {installed ? (
                    <span className="rounded bg-brand/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-brand">
                      installed
                    </span>
                  ) : null}
                </div>
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-dim">
                  {recommendation.reason}
                </p>
                {diskShort ? (
                  <p className="mt-1.5 font-mono text-[10px] text-brand-orange">
                    Only {specs?.freeDiskGb} GB free — this pull needs ~
                    {recommendation.primary.approxDiskGb + 1} GB.
                  </p>
                ) : null}
              </div>
            ) : null}

            {/* ── Setup ────────────────────────────────────────────── */}
            <div className="mt-2.5 space-y-1.5">
              {!ready ? (
                <>
                  <button
                    type="button"
                    onClick={() => setShowInstall((v) => !v)}
                    className="w-full rounded-lg bg-brand px-3 py-2 font-mono text-[10.5px] font-bold uppercase tracking-[0.1em] text-bg transition hover:brightness-110"
                  >
                    {showInstall ? "Hide install command" : "Set up with Ollama"}
                  </button>
                  {showInstall ? (
                    <div className="rounded-lg border border-line bg-bg/70 p-2.5">
                      <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-dimmer">
                        Terminal
                      </div>
                      <div className="mt-1 flex items-start gap-2">
                        <code className="flex-1 break-all font-mono text-[11px] leading-relaxed text-brand">
                          {INSTALL_COMMAND}
                        </code>
                        <button
                          type="button"
                          onClick={() => void copyCommand()}
                          className="shrink-0 rounded border border-line px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-ink-dim transition hover:text-fg"
                        >
                          {copied ? "copied" : "copy"}
                        </button>
                      </div>
                      <p className="mt-1.5 text-[10.5px] leading-relaxed text-ink-dimmer">
                        Everything runs on this machine. No account, no cloud, no key.
                      </p>
                    </div>
                  ) : null}
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => recommendation && void pull(recommendation.primary)}
                  disabled={pulling || !recommendation}
                  className="w-full rounded-lg bg-brand px-3 py-2 font-mono text-[10.5px] font-bold uppercase tracking-[0.1em] text-bg transition hover:brightness-110 disabled:opacity-60"
                >
                  {pulling ? "Pulling…" : `Pull ${recommendation?.primary.id ?? "model"}`}
                </button>
              )}

              {pullLog.length > 0 ? (
                <div className="max-h-28 overflow-y-auto rounded-lg border border-line bg-bg/70 p-2 font-mono text-[10px] leading-relaxed text-ink-dim">
                  {pullLog.map((line, i) => (
                    <div key={i} className="break-words">
                      {line}
                    </div>
                  ))}
                  <div ref={logEndRef} />
                </div>
              ) : null}
            </div>

            {/* ── Quick actions ────────────────────────────────────── */}
            <div className="mt-3 grid grid-cols-1 gap-1.5">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => {
                    setOpen(true);
                    void send(action.prompt);
                  }}
                  disabled={sending}
                  className="rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-left text-[11.5px] text-ink-dim transition hover:border-line-2 hover:text-fg disabled:opacity-60"
                >
                  {action.label}
                </button>
              ))}
            </div>

            {/* ── Chat ─────────────────────────────────────────────── */}
            <div className="mt-3 overflow-hidden rounded-xl border border-line bg-surface-2/50">
              <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
                <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-dimmer">
                  Coach
                </span>
                {context?.title ? (
                  <span className="max-w-[210px] truncate text-[10px] text-ink-dimmer">
                    {context.title}
                  </span>
                ) : null}
              </div>

              <div className="max-h-56 space-y-2 overflow-y-auto px-3 py-2.5">
                {messages.length === 0 ? (
                  <p className="text-[11.5px] leading-relaxed text-ink-dimmer">
                    Ask about the page you are on.{" "}
                    {hasModel
                      ? "Answers come from the model running on this machine."
                      : "A local model is required — nothing leaves this machine either way."}
                  </p>
                ) : null}

                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={
                      m.role === "user"
                        ? "ml-5 rounded-lg bg-brand/10 px-2.5 py-1.5 text-[11.5px] leading-relaxed text-fg"
                        : "mr-5 rounded-lg border border-line bg-surface-3 px-2.5 py-1.5 text-[11.5px] leading-relaxed text-ink-dim"
                    }
                  >
                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                    {m.meta ? (
                      <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.08em] text-brand-orange">
                        {m.meta}
                      </p>
                    ) : null}
                  </div>
                ))}

                {sending ? (
                  <div className="font-mono text-[10px] text-ink-dimmer">thinking…</div>
                ) : null}
                <div ref={chatEndRef} />
              </div>

              <div className="flex items-end gap-1.5 border-t border-line p-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  rows={2}
                  placeholder={hasModel ? "Ask the local model…" : "Install a local model to chat"}
                  className="min-h-[40px] flex-1 resize-none rounded-lg border border-line bg-surface-1 px-2 py-1.5 text-[12px] text-fg outline-none transition placeholder:text-ink-dimmer focus:border-brand/50"
                />
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={!input.trim() || sending}
                  aria-label="Send"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-3 font-mono text-[13px] text-fg transition hover:bg-surface-4 disabled:opacity-40"
                >
                  ↑
                </button>
              </div>
            </div>

            <p className="mt-2 text-center font-mono text-[9px] uppercase tracking-[0.12em] text-ink-dimmer">
              100% local · 127.0.0.1 only
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default MascotAssistant;
