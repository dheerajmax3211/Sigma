"use client";

import { useEffect, useRef, useState } from "react";
import { InlineMath } from "@/components/CodeEditor";
import {
  armKey,
  clockLevel,
  clockPercent,
  expiryOutcome,
  formatClock,
  pushbackProbe,
  secondsLeftAt,
  shouldRunClock,
  STAGE_BUDGET_CHOICES_SECONDS,
  stageBudgetSeconds,
  TIME_UP_NOTHING,
  type TimingMode,
} from "@/lib/interview/pressure";

interface QuestionMeta {
  id: string;
  kind: string;
  level: string;
  title: string;
  prompt: string;
  stages: number;
  referenceTopics: string[];
}

interface StageView {
  id: string;
  index: number;
  total: number;
  question: string;
}

interface Scored {
  stage: string;
  fraction: number;
  score: number;
  maxScore: number;
  verdict: string;
  missed: string[];
  feedback: string;
  criteria: { id: string; label: string; met: boolean; weight: number }[];
}

const VERDICT_STYLE: Record<string, string> = {
  strong: "bg-brand/15 text-brand border-brand/30",
  adequate: "bg-brand-violet/15 text-brand-violet border-brand-violet/30",
  thin: "bg-brand-orange/15 text-brand-orange border-brand-orange/30",
  missing: "bg-brand-pink/15 text-brand-pink border-brand-pink/30",
};

// ── Pressure mode ─────────────────────────────────────────────────────
// A real loop is timed, and the freeze is the thing being trained. `practice`
// keeps the old untimed behaviour; `pressure` puts a clock on each stage and
// submits whatever exists when it hits zero, because "I ran out of time" is a
// legitimate outcome worth rehearsing. The rules live in
// `lib/interview/pressure` so they can be tested without a browser clock.

// ── Web Speech API ─────────────────────────────────────────────────────
// An oral round is spoken, so the console has to accept speech and read the
// prompt back. `lib.dom` still ships no `SpeechRecognition` declaration and
// the constructor is vendor-prefixed in Chromium, so declare the exact slice
// of the API used here — no `any`, no missing global types.

type SpeechAlternative = { transcript: string; confidence: number };

type SpeechResult = {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: SpeechAlternative | undefined;
};

type SpeechResultList = {
  readonly length: number;
  readonly [index: number]: SpeechResult | undefined;
};

type SpeechRecognitionEventLike = {
  readonly resultIndex: number;
  readonly results: SpeechResultList;
};

type SpeechRecognitionErrorEventLike = {
  readonly error: string;
  readonly message?: string;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

/** Both constructors, resolved at runtime — never during render. */
function getRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function hasSynthesis(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof SpeechSynthesisUtterance !== "undefined"
  );
}

/** Keep whatever the learner already typed, then append what was dictated. */
function joinDictation(base: string, spoken: string): string {
  const heard = spoken.replace(/\s+/g, " ").trim();
  if (!heard) return base;
  const head = base.trimEnd();
  return head ? `${head} ${heard}` : heard;
}

// ── Round history ──────────────────────────────────────────────────────
// One entry per stage the learner scored themselves. Local by design: the
// server already stores the full session, but the start screen needs a glance
// it can render without a request. Values are validated on read because
// localStorage is user-editable and a bad payload must not break the screen.

const INTERVIEW_HISTORY_KEY = "sigma.interview.history";
const INTERVIEW_HISTORY_LIMIT = 12;

interface RoundHistoryEntry {
  questionId: string;
  stageId: string;
  fraction: number;
  at: number;
}

function toHistoryEntry(value: unknown): RoundHistoryEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as {
    questionId?: unknown;
    stageId?: unknown;
    fraction?: unknown;
    at?: unknown;
  };
  if (typeof record.questionId !== "string" || !record.questionId) return null;
  if (typeof record.stageId !== "string" || !record.stageId) return null;
  const fraction =
    typeof record.fraction === "number" && Number.isFinite(record.fraction)
      ? Math.max(0, Math.min(1, record.fraction))
      : 0;
  const at = typeof record.at === "number" && Number.isFinite(record.at) ? record.at : 0;
  return { questionId: record.questionId, stageId: record.stageId, fraction, at };
}

function readInterviewHistory(): RoundHistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(INTERVIEW_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const items: unknown[] = parsed;
    return items
      .map(toHistoryEntry)
      .filter((entry): entry is RoundHistoryEntry => entry !== null)
      .slice(0, INTERVIEW_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

function appendInterviewHistory(entry: RoundHistoryEntry): RoundHistoryEntry[] {
  const next = [entry, ...readInterviewHistory()].slice(0, INTERVIEW_HISTORY_LIMIT);
  try {
    window.localStorage.setItem(INTERVIEW_HISTORY_KEY, JSON.stringify(next));
  } catch {
    // Storage disabled — the list still updates in memory.
  }
  return next;
}

function historyDate(at: number): string {
  if (!at) return "—";
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** 60/90/120 override for pressure mode; `auto` keeps the per-stage budget. */
function BudgetPicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (next: number | null) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-dimmer">
      budget
      <select
        value={value === null ? "auto" : String(value)}
        onChange={(event) => {
          const raw = event.target.value;
          onChange(raw === "auto" ? null : Number(raw));
        }}
        aria-label="Pressure budget override"
        className="rounded-md border border-line bg-surface-1 px-1.5 py-1 font-mono text-[10.5px] normal-case tracking-normal text-fg focus:border-brand/40 focus:outline-none"
      >
        <option value="auto">per-stage</option>
        {STAGE_BUDGET_CHOICES_SECONDS.map((seconds) => (
          <option key={seconds} value={seconds}>
            {seconds}s
          </option>
        ))}
      </select>
    </label>
  );
}

export function InterviewConsole() {
  const [questions, setQuestions] = useState<QuestionMeta[]>([]);
  const [kind, setKind] = useState<string>("coding");
  const [level, setLevel] = useState<string>("senior");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [plan, setPlan] = useState<{
    questionId?: string;
    title: string;
    prompt: string;
    referenceTopics: string[];
  } | null>(null);
  const [stage, setStage] = useState<StageView | null>(null);
  const [answer, setAnswer] = useState("");
  const [scored, setScored] = useState<Scored | null>(null);
  const [review, setReview] = useState<{
    stage: string;
    intent: string;
    criteria: { id: string; label: string; weight: number }[];
    hint: string;
    answer: string;
    advisoryFraction: number;
    advisoryFeedback: string;
  } | null>(null);
  const [covered, setCovered] = useState<Set<string>>(new Set());
  const [summary, setSummary] = useState<{ text: string; overall: number; weakest: string | null; referenceTopics: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Timing state. `secondsLeft` is null whenever no clock is running (practice
  // mode, before a stage, or while the self-review is open).
  const [mode, setMode] = useState<TimingMode>("practice");
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [expired, setExpired] = useState(false);
  const [timeUpNote, setTimeUpNote] = useState<string | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [pressureUsed, setPressureUsed] = useState(false);
  // `null` means "whatever the question kind says"; 60/90/120 override it.
  const [budgetOverride, setBudgetOverride] = useState<number | null>(null);
  const [history, setHistory] = useState<RoundHistoryEntry[]>([]);

  // Verbal follow-ups live only in the component: the turn API has no field for
  // them, and inventing one would make the stored session disagree with what
  // the learner saw. They are shown back in the summary instead.
  const [followUp, setFollowUp] = useState("");
  const [followUps, setFollowUps] = useState<{ stage: string; text: string }[]>([]);

  const answerRef = useRef("");
  const expiryHandledRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  // Set only when the running interval itself reaches zero for the current
  // arm key. The expiry effect requires it so a budget/mode change cannot
  // submit against the old `secondsLeft` value before the new clock renders.
  const zeroKeyRef = useRef<string | null>(null);

  useEffect(() => {
    answerRef.current = answer;
  }, [answer]);

  // Voice state. `voiceChecked` keeps the first paint identical on the server
  // and the client: support is only known after mounting, so the mic stays
  // disabled until then instead of flashing an enabled button that cannot work.
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceChecked, setVoiceChecked] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const listeningRef = useRef(false);

  useEffect(() => {
    setVoiceSupported(getRecognitionConstructor() !== null);
    setVoiceChecked(true);
    setTtsSupported(hasSynthesis());
    // History is local and read after mount so the server and first client
    // paint agree; a stored entry must never be part of the prerendered HTML.
    setHistory(readInterviewHistory());
  }, []);

  function stopDictation() {
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    listeningRef.current = false;
    setListening(false);
    if (rec) {
      try {
        rec.stop();
      } catch {
        // Already stopped — nothing to unwind.
      }
    }
  }

  function startDictation() {
    // Guard double-start: a second `start()` on a live recogniser throws, and
    // two recognisers would fight over the same textarea.
    if (listeningRef.current) return;
    const Ctor = getRecognitionConstructor();
    if (!Ctor) {
      setVoiceChecked(true);
      setVoiceSupported(false);
      return;
    }

    // Snapshot what is already typed; every result re-renders base + speech so
    // interim words replace each other instead of piling up.
    const base = answer;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.maxAlternatives = 1;

    rec.onresult = (event) => {
      if (recognitionRef.current !== rec) return;
      let settled = "";
      let pending = "";
      for (let i = 0; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (!result) continue;
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) settled += `${text} `;
        else pending += `${text} `;
      }
      setAnswer(joinDictation(base, `${settled}${pending}`));
    };

    rec.onerror = (event) => {
      if (recognitionRef.current !== rec) return;
      recognitionRef.current = null;
      listeningRef.current = false;
      setListening(false);
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("Microphone access is blocked — allow it in your browser, or type the answer.");
      } else if (event.error !== "no-speech" && event.error !== "aborted") {
        setError(`Voice input stopped: ${event.error}`);
      }
    };

    rec.onend = () => {
      if (recognitionRef.current !== rec) return;
      recognitionRef.current = null;
      listeningRef.current = false;
      setListening(false);
    };

    recognitionRef.current = rec;
    try {
      rec.start();
      listeningRef.current = true;
      setListening(true);
      setError(null);
    } catch {
      // InvalidStateError if the engine is already running.
      recognitionRef.current = null;
      listeningRef.current = false;
      setListening(false);
    }
  }

  function cancelSpeech() {
    setSpeaking(false);
    if (hasSynthesis()) window.speechSynthesis.cancel();
  }

  function readQuestionAloud() {
    if (!hasSynthesis()) return;
    const synth = window.speechSynthesis;
    // Never talk over the previous utterance — the button also doubles as stop.
    synth.cancel();
    if (speaking) {
      setSpeaking(false);
      return;
    }
    const text = (stage?.question ?? plan?.prompt ?? "").trim();
    if (!text) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.lang = "en-US";
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    synth.speak(utterance);
  }

  const stageKey = stage?.id ?? "";

  // Advancing a stage closes the audio session: the old prompt is gone and its
  // transcript must not bleed into the next answer.
  useEffect(() => {
    stopDictation();
    cancelSpeech();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageKey]);

  // ── Pressure clock ────────────────────────────────────────────────────
  // The kind comes from the question actually in play, not the picker: the
  // picker can be changed while a session is open, and a behavioural round that
  // suddenly gets a 90s budget is worse than no budget at all.
  const questionKind = questions.find((q) => q.id === plan?.questionId)?.kind ?? kind;
  const pressureBudget = stageBudgetSeconds(questionKind, budgetOverride);
  const stageArmKey = armKey(mode, stageKey, pressureBudget);

  // Arming a stage (or flipping the toggle) resets everything the clock owns.
  // `review` is deliberately absent from this list: once a stage is submitted
  // the textarea must stay locked even though the review has just appeared.
  useEffect(() => {
    expiryHandledRef.current = null;
    zeroKeyRef.current = null;
    setExpired(false);
    setTimeUpNote(null);
    setFollowUp("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageArmKey]);

  useEffect(() => {
    if (!shouldRunClock(mode, Boolean(stage), Boolean(review))) {
      setSecondsLeft(null);
      return;
    }
    setPressureUsed(true);

    // Derived from a wall-clock stamp rather than decremented per tick: a
    // hidden tab throttles intervals, and a countdown that drifts away from the
    // real thing is worse than none.
    const startedAt = Date.now();
    const budget = pressureBudget;
    setSecondsLeft(budget);
    const id = window.setInterval(() => {
      const left = secondsLeftAt(startedAt, Date.now(), budget);
      setSecondsLeft(left);
      if (left <= 0) {
        zeroKeyRef.current = `${stageKey}:${budget}`;
        window.clearInterval(id);
      }
    }, 250);

    return () => window.clearInterval(id);
  }, [mode, stageKey, pressureBudget, review, stage]);

  // One expiry per stage. A separate effect (rather than a submit call inside
  // the interval) keeps the auto-submit on the same path as the manual one.
  useEffect(() => {
    if (!shouldRunClock(mode, Boolean(stage), Boolean(review))) return;
    if (secondsLeft !== 0) return;
    const key = `${stageKey}:${pressureBudget}`;
    if (zeroKeyRef.current !== key) return;
    if (expiryHandledRef.current === key) return;
    expiryHandledRef.current = key;
    handleTimeUp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, mode, stageKey, pressureBudget, review, stage]);

  function handleTimeUp() {
    if (!shouldRunClock(mode, Boolean(stage), Boolean(review)) || !sessionId) return;
    stopDictation();
    setExpired(true);

    // Read the ref, not state: the last keystroke may still be in flight when
    // the clock lands on zero, and losing it would misreport the answer.
    const outcome = expiryOutcome(answerRef.current);
    if (outcome.action === "skip") {
      setSkipped((n) => n + 1);
      setTimeUpNote(outcome.note);
      return;
    }

    setTimeUpNote(outcome.note);
    // A manual submit may already be recording this answer; the clock must not
    // post a second turn on top of it.
    if (inFlightRef.current) return;
    void submit(answerRef.current, true).then((ok) => {
      // A failed auto-submit must not look like a recorded answer: unlock the
      // box so the learner can retry instead of losing what they wrote.
      if (!ok) {
        setExpired(false);
        setTimeUpNote("time up — submit failed, your answer is still here");
      }
    });
  }

  useEffect(() => {
    return () => {
      const rec = recognitionRef.current;
      recognitionRef.current = null;
      listeningRef.current = false;
      if (rec) {
        try {
          rec.abort();
        } catch {
          // Engine already gone.
        }
      }
      if (hasSynthesis()) window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => {
    fetch("/api/interview")
      .then((r) => r.json())
      .then((d) => setQuestions(d.questions ?? []))
      .catch((e) => setError(e.message));
  }, []);

  const kinds = Array.from(new Set(questions.map((q) => q.kind)));

  async function start(qid?: string) {
    setBusy(true);
    setError(null);
    setScored(null);
    setSummary(null);
    setAnswer("");
    setSkipped(0);
    setFollowUps([]);
    setFollowUp("");
    setPressureUsed(false);
    setExpired(false);
    setTimeUpNote(null);
    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "start", kind, level, questionId: qid }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "start failed");
      setSessionId(d.sessionId);
      setPlan(d.plan);
      setStage(d.stage);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Record one answer and open its rubric.
   *
   * `text` is explicit so the clock can hand over the ref's latest value rather
   * than whatever state had committed. Returns whether the turn was recorded,
   * because an auto-submit that fails must not be reported as a submitted answer.
   */
  async function submit(text: string = answer, auto = false): Promise<boolean> {
    // `inFlightRef` rather than `busy`: pressing submit as the clock expires
    // would otherwise post the same turn twice.
    if (!sessionId || !text.trim() || inFlightRef.current) return false;
    inFlightRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "answer", sessionId, answer: text }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "submit failed");
      // The answer is recorded, but nothing is scored yet: the learner now
      // judges their own answer against the rubric, which is what makes the
      // grade mean something.
      setReview(d.review ?? null);
      setCovered(new Set());
      // An auto-submit ends the stage's typing window; a manual one leaves the
      // box editable as it always did.
      if (auto) setExpired(true);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  }

  async function saveSelfScore() {
    if (!sessionId || !review) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "selfscore",
          sessionId,
          stage: review.stage,
          covered: [...covered],
        }),
      });
      const d = (await res.json()) as {
        error?: string;
        done?: boolean;
        stage?: StageView;
        summary?: {
          text: string;
          overall: number;
          weakest: string | null;
          referenceTopics: string[];
        };
        selfScore?: { stage: string; score: number; fraction: number };
      };
      if (!res.ok) throw new Error(d.error ?? "could not save your score");

      // Bank the score before the review closes: `review` is about to be
      // nulled, and the question id lives on the plan rather than the stage.
      // The returned fraction is the weighted self-assessment, not the
      // advisory keyword guess, so history means what the screen said.
      const questionId = plan?.questionId;
      const fraction = d.selfScore?.fraction;
      if (questionId && typeof fraction === "number" && Number.isFinite(fraction)) {
        setHistory(
          appendInterviewHistory({
            questionId,
            stageId: review.stage,
            fraction,
            at: Date.now(),
          }),
        );
      }

      // Bank the pushback answer before the review closes: the turn API has no
      // field for it, so this array is the only record the summary can show.
      const given = followUp.trim();
      if (given) {
        setFollowUps((prev) => [...prev, { stage: review.stage, text: given }]);
      }
      setFollowUp("");
      setReview(null);
      setAnswer("");
      if (d.done) {
        setSummary(d.summary ?? null);
        setStage(null);
        setSessionId(null);
      } else if (d.stage) {
        setStage(d.stage);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** Leave the round without a score. Shared by the link and the time-up recovery. */
  function abandonSession() {
    if (sessionId) {
      void fetch("/api/interview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "abandon", sessionId }),
      });
    }
    setStage(null);
    setSessionId(null);
    setPlan(null);
    setAnswer("");
    setReview(null);
    setExpired(false);
    setTimeUpNote(null);
    setSecondsLeft(null);
    setFollowUp("");
  }

  // ── Not started: pick a question ─────────────────────────────────────
  if (!stage && !summary) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-dimmer">
            kind
          </span>
          {(kinds.length ? kinds : ["coding", "ml_system"]).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`rounded-md border px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.08em] transition ${
                kind === k
                  ? "border-brand/40 bg-brand/10 text-brand"
                  : "border-line text-ink-dimmer hover:text-fg"
              }`}
            >
              {k.replace("_", " ")}
            </button>
          ))}
          <span className="ml-3 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-dimmer">
            level
          </span>
          {["mid", "senior", "staff"].map((l) => (
            <button
              key={l}
              onClick={() => setLevel(l)}
              className={`rounded-md border px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.08em] transition ${
                level === l
                  ? "border-brand-orange/40 bg-brand-orange/10 text-brand-orange"
                  : "border-line text-ink-dimmer hover:text-fg"
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-1 px-3 py-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dimmer">
            mode
          </span>
          <div role="group" aria-label="Timing mode" className="flex rounded-lg border border-line bg-surface-2 p-0.5">
            {(["practice", "pressure"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={`rounded-md px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.08em] transition ${
                  mode === m
                    ? m === "pressure"
                      ? "bg-brand-orange/15 text-brand-orange"
                      : "bg-brand/12 text-brand"
                    : "text-ink-dimmer hover:text-fg"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          {mode === "pressure" && (
            <BudgetPicker value={budgetOverride} onChange={setBudgetOverride} />
          )}
          <span className="flex-1 text-[12px] leading-relaxed text-ink-dim">
            {mode === "pressure"
              ? `Timed: ${
                  budgetOverride === null
                    ? "1:30 per coding/ML stage, 1:00 behavioural"
                    : `${formatClock(pressureBudget)} every stage`
                }. When the clock hits zero it submits what you have — freeze now, not in the room.`
              : "Untimed. Think it through, revise, submit when you are ready."}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface-1 px-3 py-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dimmer">
            oral round
          </span>
          <span className="text-[12px] leading-relaxed text-ink-dim">
            Pick a question below to rehearse out loud — hear the prompt, then dictate your answer.
          </span>
          <button
            type="button"
            disabled
            title="Pick a question first"
            className="ml-auto rounded-md border border-line bg-surface-2 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-dimmer opacity-70"
          >
            Read the question aloud
          </button>
        </div>

        {scored && (
          <div className="rounded-2xl border border-line bg-surface-1 p-4">
            <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dimmer">
              last stage · {scored.stage}
            </div>
            <p className="text-[13px] leading-relaxed text-ink-dim">{scored.feedback}</p>
          </div>
        )}

        {history.length > 0 && (
          <div className="rounded-2xl border border-line bg-surface-1 p-4">
            <div className="mb-1.5 flex items-baseline gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dimmer">
                your last rounds
              </span>
              <span className="ml-auto font-mono text-[9.5px] uppercase tracking-[0.08em] text-ink-dimmer">
                self-scored · newest first
              </span>
            </div>
            <ul className="flex flex-col divide-y divide-line">
              {history.slice(0, 6).map((entry, i) => {
                const title =
                  questions.find((q) => q.id === entry.questionId)?.title ?? entry.questionId;
                return (
                  <li
                    key={`${entry.questionId}-${entry.stageId}-${entry.at}-${i}`}
                    className="flex items-baseline gap-2 py-1.5"
                  >
                    <span
                      className={`w-10 shrink-0 text-right font-mono text-[12.5px] tabular-nums ${
                        entry.fraction >= 0.75
                          ? "text-brand"
                          : entry.fraction >= 0.5
                            ? "text-brand-violet"
                            : "text-brand-orange"
                      }`}
                    >
                      {Math.round(entry.fraction * 100)}%
                    </span>
                    <span className="min-w-0 truncate text-[12.5px] text-fg">{title}</span>
                    <span className="shrink-0 font-mono text-[9.5px] uppercase tracking-[0.08em] text-ink-dimmer">
                      {entry.stageId}
                    </span>
                    <span className="ml-auto shrink-0 font-mono text-[10.5px] text-ink-dimmer">
                      {historyDate(entry.at)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          {questions.map((q) => (
            <button
              key={q.id}
              onClick={() => start(q.id)}
              disabled={busy}
              className="rounded-2xl border border-line bg-surface-1 p-4 text-left transition hover:border-line-2 hover:bg-surface-2 disabled:opacity-50"
            >
              <div className="mb-1.5 flex items-center gap-2">
                <span className="text-[14px] font-semibold text-fg">{q.title}</span>
                <span className="ml-auto rounded border border-line bg-surface-3 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-ink-dimmer">
                  {q.kind.replace("_", " ")} · {q.level}
                </span>
              </div>
              <p className="text-[12.5px] leading-relaxed text-ink-dim">{q.prompt}</p>
              <p className="mt-2 font-mono text-[10px] text-ink-dimmer">
                {q.stages} stages · rubric-scored
              </p>
            </button>
          ))}
        </div>
        {error && <p className="font-mono text-[12px] text-brand-pink">{error}</p>}
      </div>
    );
  }

  // ── Finished ─────────────────────────────────────────────────────────
  if (summary) {
    const pct = Math.round(summary.overall * 100);
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-line bg-surface-1 p-6">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">
            session complete
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-[2.6rem] font-semibold tracking-[-0.03em] text-fg">{pct}%</span>
            <span className="font-mono text-[11px] text-ink-dim">across all stages</span>
          </div>
          <p className="mt-3 text-[13.5px] leading-relaxed text-ink-dim">{summary.text}</p>

          {(pressureUsed || skipped > 0 || followUps.length > 0) && (
            <div className="mt-4 grid gap-4 border-t border-line pt-3 sm:grid-cols-2">
              <div>
                <div className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-dimmer">
                  skipped
                </div>
                <p className="mt-1 flex items-baseline gap-2">
                  <span className="font-mono text-[17px] text-fg">{skipped}</span>
                  <span className="text-[11.5px] leading-relaxed text-ink-dim">
                    {skipped === 1
                      ? "stage the clock ran out on with nothing in the box"
                      : "stages the clock ran out on with nothing in the box"}
                  </span>
                </p>
              </div>
              <div>
                <div className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-dimmer">
                  follow-ups you gave
                </div>
                {followUps.length > 0 ? (
                  <ul className="mt-1 flex flex-col gap-1.5">
                    {followUps.map((f, i) => (
                      <li
                        key={`${f.stage}-${i}`}
                        className="flex items-start gap-2 text-[12.5px] leading-relaxed text-ink-dim"
                      >
                        <span className="mt-0.5 shrink-0 font-mono text-[9.5px] uppercase tracking-[0.08em] text-brand-orange">
                          {f.stage}
                        </span>
                        <span>{f.text}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-[12px] text-ink-dimmer">
                    none recorded — the pushback went unanswered
                  </p>
                )}
              </div>
            </div>
          )}
          {summary.referenceTopics.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <div className="mb-1.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-dimmer">
                revisit
              </div>
              <div className="flex flex-wrap gap-1.5">
                {summary.referenceTopics.map((t) => (
                  <a
                    key={t}
                    href={`/topic/${t}`}
                    className="rounded border border-brand/25 bg-brand/[0.07] px-2 py-0.5 font-mono text-[11px] text-brand transition hover:bg-brand/15"
                  >
                    {t}
                  </a>
                ))}
              </div>
            </div>
          )}
          <button
            onClick={() => {
              setSummary(null);
              setScored(null);
              setSkipped(0);
              setFollowUps([]);
              setFollowUp("");
              setPressureUsed(false);
              setExpired(false);
              setTimeUpNote(null);
            }}
            className="mt-5 rounded-lg border border-line bg-surface-2 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-fg transition hover:border-line-2"
          >
            new session
          </button>
        </div>
      </div>
    );
  }

  // ── In progress ──────────────────────────────────────────────────────
  // Clock presentation, derived once: calm, amber under 20s, red under 10s.
  const clockSeconds = secondsLeft ?? 0;
  const clockPct = clockPercent(clockSeconds, pressureBudget);
  const clock = clockLevel(clockSeconds);
  const clockTone = clock === "red" ? "text-red-400" : clock === "amber" ? "text-amber-300" : "text-fg";
  const clockBarTone = clock === "red" ? "bg-red-500" : clock === "amber" ? "bg-amber-400" : "bg-brand";

  // The box is sealed once the clock is out or the turn is already recorded.
  // Without the second condition, flipping back to practice during the review
  // would re-open a stage the API has already stored.
  const answerLocked = expired || review !== null;

  return (
    <div className="flex flex-col gap-4">
      {plan && (
        <div className="rounded-2xl border border-line bg-surface-1 p-5">
          <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-brand-orange">
            the prompt
          </div>
          <h2 className="text-[17px] font-semibold text-fg">{plan.title}</h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-dim">
            <InlineMath source={plan.prompt} />
          </p>
        </div>
      )}

      {stage && (
        <div className="rounded-2xl border border-line bg-surface-1 p-5">
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-brand">
              stage {stage.index + 1} / {stage.total} · {stage.id}
            </span>
            {mode === "pressure" && (
              <span
                className={`font-mono text-[10px] uppercase tracking-[0.1em] ${
                  skipped > 0 ? "text-brand-pink" : "text-ink-dimmer"
                }`}
                title="stages the clock ran out on with nothing in the box"
              >
                skipped {skipped}
              </span>
            )}
            <div className="ml-auto flex gap-1">
              {Array.from({ length: stage.total }, (_, i) => (
                <span
                  key={i}
                  className={`h-1 w-5 rounded-full ${
                    i < stage.index ? "bg-brand" : i === stage.index ? "bg-brand-orange" : "bg-surface-4"
                  }`}
                />
              ))}
            </div>
          </div>
          <p className="text-[15px] font-medium leading-relaxed text-fg">{stage.question}</p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={readQuestionAloud}
              disabled={!ttsSupported}
              title={
                ttsSupported ? "Speak the prompt with speechSynthesis" : "Speech playback is not supported in this browser"
              }
              className={`rounded-md border px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.08em] transition ${
                speaking
                  ? "border-brand-orange/50 bg-brand-orange/15 text-brand-orange"
                  : "border-line bg-surface-2 text-ink-dim hover:border-line-2 hover:text-fg"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {speaking ? "◼ stop reading" : "▶ Read the question aloud"}
            </button>

            <button
              type="button"
              onClick={listening ? stopDictation : startDictation}
              disabled={!voiceSupported}
              aria-pressed={listening}
              title={
                !voiceChecked
                  ? "Checking voice support…"
                  : !voiceSupported
                    ? "Voice input is not supported in this browser"
                    : listening
                      ? "Stop dictating"
                      : "Dictate your answer"
              }
              className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.08em] transition ${
                listening
                  ? "animate-pulse border-brand-pink/60 bg-brand-pink/15 text-brand-pink"
                  : "border-line bg-surface-2 text-ink-dim hover:border-line-2 hover:text-fg"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <span aria-hidden className="text-[11px] leading-none">
                ●
              </span>
              {listening ? "listening…" : "answer by voice"}
            </button>

            {(listening || speaking) && (
              <span aria-live="polite" className="font-mono text-[10.5px] text-ink-dimmer">
                {listening ? "speak naturally — words land in the box" : "reading the prompt"}
              </span>
            )}
          </div>

          {/* Timing mode lives directly above the box: the decision that changes
              how you answer belongs next to where you answer. */}
          <div className="mt-3.5 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-2/70 px-3 py-2">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-dimmer">
              mode
            </span>
            <div role="group" aria-label="Timing mode" className="flex rounded-lg border border-line bg-surface-1 p-0.5">
              {(["practice", "pressure"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  aria-pressed={mode === m}
                  title={
                    m === "practice"
                      ? "Untimed — think it through"
                      : "Timed, like the real loop: the clock submits for you"
                  }
                  className={`rounded-md px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.08em] transition ${
                    mode === m
                      ? m === "pressure"
                        ? "bg-brand-orange/15 text-brand-orange"
                        : "bg-brand/12 text-brand"
                      : "text-ink-dimmer hover:text-fg"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            {mode === "pressure" && (
              <BudgetPicker value={budgetOverride} onChange={setBudgetOverride} />
            )}

            {mode === "pressure" && secondsLeft !== null && !review ? (
              <div className="ml-auto flex items-center gap-2.5">
                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-dimmer">
                  time left
                </span>
                <span
                  role="timer"
                  aria-live="off"
                  aria-label={`${secondsLeft} seconds left in this stage`}
                  className={`font-mono text-[15px] tabular-nums ${clockTone}`}
                >
                  {formatClock(secondsLeft)}
                </span>
                <div className="h-1 w-24 overflow-hidden rounded-full bg-surface-4" aria-hidden>
                  <div
                    className={`h-full rounded-full transition-[width] duration-200 ${clockBarTone}`}
                    style={{ width: `${clockPct}%` }}
                  />
                </div>
              </div>
            ) : mode === "pressure" ? (
              <span className="ml-auto font-mono text-[10px] text-ink-dimmer">
                {expired ? "clock out" : review ? "clock stopped — reviewing" : "clock armed"}
              </span>
            ) : (
              <span className="ml-auto font-mono text-[10px] text-ink-dimmer">
                untimed — think as long as you like
              </span>
            )}
          </div>

          <textarea
            value={answer}
            onChange={(e) => {
              // Mirror into the ref so the clock can never submit a stale answer.
              answerRef.current = e.target.value;
              setAnswer(e.target.value);
            }}
            readOnly={answerLocked}
            aria-readonly={answerLocked}
            rows={7}
            placeholder={
              mode === "pressure"
                ? `Answer against the clock — ${formatClock(pressureBudget)} per stage.`
                : "Answer as you would out loud — be specific about trade-offs and numbers."
            }
            className={`mt-2.5 w-full resize-y rounded-xl border bg-surface-2 px-3.5 py-3 font-mono text-[12.5px] leading-relaxed text-fg placeholder:text-ink-dimmer focus:outline-none ${
              answerLocked
                ? "cursor-not-allowed border-line opacity-70"
                : "border-line focus:border-brand/40"
            }`}
          />

          {timeUpNote && (
            <div className="mt-2">
              <p
                className={`flex items-center gap-1.5 font-mono text-[11.5px] ${
                  expired ? "text-brand-orange" : "text-brand-pink"
                }`}
              >
                <span aria-hidden>◷</span>
                {timeUpNote}
              </p>
              {timeUpNote === TIME_UP_NOTHING && (
                <p className="mt-1 text-[11.5px] leading-relaxed text-ink-dimmer">
                  Nothing was recorded for this stage.{" "}
                  <button
                    type="button"
                    onClick={() => setMode("practice")}
                    className="text-brand underline underline-offset-2 hover:brightness-110"
                  >
                    Answer it untimed
                  </button>{" "}
                  or{" "}
                  <button
                    type="button"
                    onClick={abandonSession}
                    className="text-ink-dim underline underline-offset-2 hover:text-fg"
                  >
                    end the round
                  </button>
                  .
                </p>
              )}
            </div>
          )}

          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={() => void submit()}
              disabled={busy || answerLocked || !answer.trim()}
              className="rounded-lg bg-brand px-5 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-black transition hover:brightness-110 disabled:opacity-40"
            >
              {busy ? "scoring…" : "submit answer"}
            </button>
            <span className="font-mono text-[10.5px] text-ink-dimmer">
              {answer.trim().split(/\s+/).filter(Boolean).length} words
            </span>
            <button
              onClick={abandonSession}
              className="ml-auto font-mono text-[10.5px] text-ink-dimmer underline-offset-2 hover:text-fg hover:underline"
            >
              abandon
            </button>
          </div>
        </div>
      )}

      {review && (
        <div className="rounded-2xl border border-brand/30 bg-brand/[0.04] p-5">
          <div className="flex items-center gap-2">
            <span className="rounded border border-brand/30 bg-brand/15 px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-brand">
              self-review
            </span>
            <span className="font-mono text-[11px] text-ink-dim">
              score yourself against the rubric · stage {review.stage}
            </span>
          </div>

          <p className="mt-3 text-[13px] leading-relaxed text-ink-dim">
            <span className="font-semibold text-fg">What this stage tests: </span>
            {review.intent}
          </p>

          <p className="mt-3 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-dimmer">
            Did your answer cover these?
          </p>
          <div className="mt-2 flex flex-col gap-2">
            {review.criteria.map((c) => {
              const on = covered.has(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() =>
                    setCovered((prev) => {
                      const next = new Set(prev);
                      if (next.has(c.id)) next.delete(c.id);
                      else next.add(c.id);
                      return next;
                    })
                  }
                  className={`flex items-start gap-3 rounded-xl border p-3 text-left transition ${
                    on
                      ? "border-brand/45 bg-brand/[0.08]"
                      : "border-line bg-surface-1 hover:border-line-2"
                  }`}
                >
                  <span
                    className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border font-mono text-[11px] ${
                      on ? "border-brand text-brand" : "border-line-2 text-transparent"
                    }`}
                  >
                    ✓
                  </span>
                  <span className="flex-1 text-[13px] leading-relaxed text-fg/90">{c.label}</span>
                  <span className="shrink-0 font-mono text-[10px] text-ink-dimmer">w{c.weight}</span>
                </button>
              );
            })}
          </div>

          {review.hint && (
            <p className="mt-3 text-[12.5px] leading-relaxed text-ink-dim">
              <span className="font-semibold text-brand-orange">Hint: </span>
              {review.hint}
            </p>
          )}

          {/* The part every mock interview skips: the interviewer hears a
              reasonable answer and pushes on it. Not scored — it exists to
              practise the second sentence, which is where candidates fold. */}
          {mode === "pressure" && (
            <div className="mt-3.5 rounded-xl border border-brand-orange/30 bg-brand-orange/[0.06] p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded border border-brand-orange/30 bg-brand-orange/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-brand-orange">
                  verbal follow-up
                </span>
                <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-dimmer">
                  not scored · shown in your summary
                </span>
              </div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-ink-dim">
                The interviewer pushes back:{" "}
                <span className="text-fg">
                  &quot;{pushbackProbe(review.hint, review.stage)}&quot;
                </span>
                . Add one sentence to your answer.
              </p>
              <textarea
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                rows={2}
                placeholder="One sentence, at speaking pace."
                className="mt-2 w-full resize-y rounded-lg border border-line bg-surface-1 px-3 py-2 font-mono text-[12px] leading-relaxed text-fg placeholder:text-ink-dimmer focus:border-brand-orange/40 focus:outline-none"
              />
            </div>
          )}

          <p className="mt-3 text-[11.5px] leading-relaxed text-ink-dimmer">
            A keyword matcher guessed {Math.round(review.advisoryFraction * 100)}% coverage from your
            wording. That number is advisory only — it cannot tell a well-phrased answer from a
            keyword soup, so it is not your score.
          </p>

          <button
            onClick={saveSelfScore}
            disabled={busy}
            className="mt-4 rounded-xl bg-brand px-4 py-2 text-[13px] font-semibold text-[#04140f] transition hover:bg-brand/90 disabled:opacity-50"
          >
            {busy ? "saving…" : `Save my score (${covered.size}/${review.criteria.length} covered)`}
          </button>
        </div>
      )}

      {scored && (
        <div className="rounded-2xl border border-line bg-surface-1 p-5">
          <div className="mb-2 flex items-center gap-2">
            <span
              className={`rounded border px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em] ${
                VERDICT_STYLE[scored.verdict] ?? VERDICT_STYLE.thin
              }`}
            >
              {scored.verdict}
            </span>
            <span className="font-mono text-[11px] text-ink-dim">
              {scored.score.toFixed(1)} / {scored.maxScore.toFixed(1)} criteria weight ·{" "}
              {Math.round(scored.fraction * 100)}%
            </span>
          </div>
          <p className="text-[13px] leading-relaxed text-ink-dim">{scored.feedback}</p>

          <div className="mt-3 flex flex-col gap-1 border-t border-line pt-2.5">
            {scored.criteria.map((c) => (
              <div key={c.id} className="flex items-start gap-2">
                <span
                  className={`mt-[3px] font-mono text-[11px] ${c.met ? "text-brand" : "text-brand-pink"}`}
                >
                  {c.met ? "✓" : "✗"}
                </span>
                <span
                  className={`text-[12px] leading-relaxed ${c.met ? "text-ink-dim" : "text-ink-dimmer"}`}
                >
                  {c.label}
                </span>
                <span className="ml-auto font-mono text-[9.5px] text-ink-dimmer">{c.weight}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <p className="font-mono text-[12px] text-brand-pink">{error}</p>}

      <p className="px-1 text-[11.5px] leading-relaxed text-ink-dimmer">
        Scoring is a deterministic rubric matcher, not a language model: each
        stage declares the criteria a strong answer covers, and your score is the
        weighted fraction you addressed. The same answer always scores the same,
        and the checklist above shows exactly which criteria you missed — a model
        could explain a score, but it must never produce one.
      </p>
    </div>
  );
}
