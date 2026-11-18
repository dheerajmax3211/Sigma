"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface Hit {
  topic_id: string;
  title: string;
  summary: string;
  track_id: string | null;
  kind: string | null;
  difficulty: string | null;
  snippet: string;
  rank: number;
}

export interface TrackRef {
  id: string;
  title: string;
}

const RECENT_KEY = "sigma.recentSearches";
const RECENT_MAX = 5;
/** Mirrors the CHECK constraint on `topic.difficulty` in the schema. */
const LEVELS = ["intro", "easy", "medium", "hard", "expert"] as const;

/**
 * Words that carry no signal in an FTS query. They are dropped when deriving
 * "drop a token" suggestions, because "the" alone is never a useful query.
 */
const STOP = new Set([
  "the", "and", "for", "with", "from", "that", "this", "these", "those",
  "what", "when", "where", "which", "how", "why", "does", "did", "into",
  "over", "under", "about", "are", "was", "were", "its", "their", "them",
  "then", "than", "your", "you", "can", "not", "but", "all", "any", "use",
  "using", "used", "between", "there", "here", "have", "has", "will",
]);

function splitTokens(query: string): string[] {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9+#-]+/)
        .filter((t) => t.length >= 3 && !STOP.has(t)),
    ),
  );
}

function readRecent(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

/** A pill that reports its own pressed state to assistive tech. */
function Chip({
  active = false,
  count,
  onClick,
  label,
}: {
  active?: boolean;
  count?: number;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10.5px] transition ${
        active
          ? "border-brand/60 bg-brand/15 text-brand"
          : "border-line bg-surface-2 text-ink-dim hover:border-line-2 hover:text-fg"
      }`}
    >
      {label}
      {typeof count === "number" && <span className="text-[9.5px] opacity-60">{count}</span>}
    </button>
  );
}

/**
 * Search the curriculum.
 *
 * Snippets arrive with `<mark>` around the matched terms, which is the only
 * reason this uses dangerouslySetInnerHTML. The markup is produced by SQLite's
 * `snippet()` from indexed content, not from user input — the query itself is
 * never echoed into the HTML.
 *
 * Filters are applied client-side to the returned page of hits, so counts on
 * the chips describe exactly what is on screen, and selecting a filter never
 * issues another request.
 */
export function SearchConsole({ tracks = [] }: { tracks?: TrackRef[] }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const [trackFilter, setTrackFilter] = useState<Set<string>>(new Set());
  const [levelFilter, setLevelFilter] = useState<Set<string>>(new Set());
  const [recent, setRecent] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Identifies the newest request so a stale response cannot land on the list.
  const reqId = useRef(0);
  // Fires the "settled query" commit after results arrive.
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirrors `recent` so a click can compute the next list outside a state
  // updater: clicking a result navigates the document, so the write has to
  // happen in the handler rather than in an effect that may never flush.
  const recentRef = useRef<string[]>([]);

  const persistRecent = useCallback((list: string[]) => {
    try {
      window.localStorage.setItem(RECENT_KEY, JSON.stringify(list));
    } catch {
      // Private mode or a full quota — history is a convenience, not state.
    }
  }, []);

  // Load history after mount: reading localStorage during render would break
  // SSR/hydration, and the initial paint should not depend on it.
  useEffect(() => {
    const saved = readRecent();
    recentRef.current = saved;
    setRecent(saved);
  }, []);

  const remember = useCallback(
    (raw: string) => {
      const term = raw.trim().replace(/\s+/g, " ");
      if (term.length < 2) return;
      const lower = term.toLowerCase();
      // A longer query subsumes the prefixes typed on the way to it, so a slow
      // typist ends up with "attention" in history rather than "att", "atten".
      const kept = recentRef.current.filter((x) => {
        const xl = x.toLowerCase();
        if (xl === lower) return false;
        if (lower.startsWith(xl)) return false;
        return true;
      });
      const next = [term, ...kept].slice(0, RECENT_MAX);
      recentRef.current = next;
      setRecent(next);
      persistRecent(next);
    },
    [persistRecent],
  );

  const clearRecent = useCallback(() => {
    recentRef.current = [];
    setRecent([]);
    try {
      window.localStorage.removeItem(RECENT_KEY);
    } catch {
      // Ignore — the in-memory list is cleared either way.
    }
  }, []);

  const run = useCallback(
    async (query: string) => {
      if (!query.trim()) {
        reqId.current += 1;
        setHits([]);
        setSearched(false);
        setTrackFilter(new Set());
        setLevelFilter(new Set());
        setSuggestions([]);
        return;
      }
      // A slow response for an abandoned query must not overwrite the results
      // of the query the learner is actually looking at.
      const id = reqId.current + 1;
      reqId.current = id;
      setBusy(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const d = (await res.json()) as { results?: Hit[] };
        if (id !== reqId.current) return;
        const results = Array.isArray(d.results) ? d.results : [];
        setHits(results);
        // Drop any filter whose value no longer occurs in the result set —
        // otherwise a chip can disappear while still filtering the list to zero.
        const presentTracks = new Set(
          results.map((r) => r.track_id).filter((v): v is string => typeof v === "string"),
        );
        const presentLevels = new Set(
          results.map((r) => r.difficulty).filter((v): v is string => typeof v === "string"),
        );
        setTrackFilter((prev) => new Set([...prev].filter((t) => presentTracks.has(t))));
        setLevelFilter((prev) => new Set([...prev].filter((l) => presentLevels.has(l))));
        setSearched(true);
        // A query someone stopped typing on for a moment is a query they ran;
        // record it even if they never press Enter or open a result.
        if (results.length > 0) {
          if (commitTimer.current) clearTimeout(commitTimer.current);
          commitTimer.current = setTimeout(() => remember(query), 900);
        }
      } catch {
        if (id !== reqId.current) return;
        setHits([]);
        setSearched(true);
      } finally {
        if (id === reqId.current) setBusy(false);
      }
    },
    [remember],
  );

  // Debounce so a fast typist does not issue a query per keystroke.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    // A keystroke invalidates a pending "this query settled" commit.
    if (commitTimer.current) {
      clearTimeout(commitTimer.current);
      commitTimer.current = null;
    }
    timer.current = setTimeout(() => void run(q), 220);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q, run]);

  useEffect(
    () => () => {
      if (commitTimer.current) clearTimeout(commitTimer.current);
    },
    [],
  );

  // Facets come from the hits themselves, so every chip is guaranteed to match
  // at least one visible result and the counts are honest.
  const facets = useMemo(() => {
    const byTrack = new Map<string, number>();
    const byLevel = new Map<string, number>();
    for (const h of hits) {
      if (h.track_id) byTrack.set(h.track_id, (byTrack.get(h.track_id) ?? 0) + 1);
      if (h.difficulty) byLevel.set(h.difficulty, (byLevel.get(h.difficulty) ?? 0) + 1);
    }
    const trackList = [...byTrack.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    );
    const levelList = [...byLevel.entries()].sort(
      (a, b) => LEVELS.indexOf(a[0] as (typeof LEVELS)[number]) - LEVELS.indexOf(b[0] as (typeof LEVELS)[number]),
    );
    return { trackList, levelList };
  }, [hits]);

  const trackNames = useMemo(() => new Map(tracks.map((t) => [t.id, t.title])), [tracks]);

  const visible = useMemo(
    () =>
      hits.filter(
        (h) =>
          (trackFilter.size === 0 || (h.track_id !== null && trackFilter.has(h.track_id))) &&
          (levelFilter.size === 0 || (h.difficulty !== null && levelFilter.has(h.difficulty))),
      ),
    [hits, trackFilter, levelFilter],
  );

  const activeFilters = trackFilter.size + levelFilter.size;
  const clearFilters = () => {
    setTrackFilter(new Set());
    setLevelFilter(new Set());
  };

  const toggleTrack = (id: string) => {
    setTrackFilter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleLevel = (level: string) => {
    setLevelFilter((prev) => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  };

  /**
   * Zero-hit guidance. Every suggestion is derived from the tokens that were
   * actually searched and then probed against the index, so nothing offered
   * here is invented: a chip only appears if it really has hits.
   */
  useEffect(() => {
    if (!searched || busy || hits.length > 0) {
      setSuggestions([]);
      return;
    }
    const tokens = splitTokens(q);
    if (tokens.length === 0) {
      setSuggestions([]);
      return;
    }
    const candidates: string[] = [];
    if (tokens.length > 1) {
      // "drop one word" is the most likely fix for an over-long conjunctive query
      for (let i = 0; i < tokens.length; i += 1) {
        candidates.push(tokens.filter((_, j) => j !== i).join(" "));
      }
      candidates.push(tokens.slice(0, 2).join(" "));
    }
    for (const t of [...tokens].sort((a, b) => b.length - a.length)) candidates.push(t);

    const original = q.trim().toLowerCase();
    const probes = Array.from(new Set(candidates)).filter((c) => c !== original).slice(0, 6);
    if (probes.length === 0) {
      setSuggestions([]);
      return;
    }

    let cancelled = false;
    void Promise.all(
      probes.map(async (candidate) => {
        try {
          const res = await fetch(`/api/search?q=${encodeURIComponent(candidate)}&limit=1`);
          const d = (await res.json()) as { total?: number; results?: unknown[] };
          const total =
            typeof d.total === "number" ? d.total : Array.isArray(d.results) ? d.results.length : 0;
          return total > 0 ? candidate : null;
        } catch {
          return null;
        }
      }),
    ).then((list) => {
      if (cancelled) return;
      setSuggestions(list.filter((v): v is string => v !== null).slice(0, 3));
    });
    return () => {
      cancelled = true;
    };
  }, [searched, busy, hits.length, q]);

  const status = busy
    ? "searching…"
    : searched
      ? activeFilters > 0 || visible.length !== hits.length
        ? `${visible.length} of ${hits.length}`
        : `${hits.length} hit${hits.length === 1 ? "" : "s"}`
      : "FTS5";

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && q.trim()) {
              if (timer.current) clearTimeout(timer.current);
              if (commitTimer.current) clearTimeout(commitTimer.current);
              remember(q);
              void run(q);
            }
          }}
          placeholder="Search the curriculum — try “attention”, “condition number”, “Lasso”…"
          autoFocus
          aria-label="Search the curriculum"
          className="w-full rounded-xl border border-line bg-surface-1 px-4 py-3 pr-24 font-mono text-[13.5px] text-fg placeholder:text-ink-dimmer focus:border-brand/40 focus:outline-none"
        />
        <span
          aria-live="polite"
          className="absolute right-4 top-1/2 -translate-y-1/2 font-mono text-[10.5px] text-ink-dimmer"
        >
          {status}
        </span>
      </div>

      {!q.trim() && recent.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dimmer">
            Recent
          </span>
          {recent.map((term) => (
            <Chip
              key={term}
              label={term}
              onClick={() => {
                remember(term);
                setQ(term);
              }}
            />
          ))}
          <button
            type="button"
            onClick={clearRecent}
            className="ml-1 font-mono text-[10px] text-ink-dimmer underline decoration-dotted underline-offset-2 hover:text-fg"
          >
            clear
          </button>
        </div>
      )}

      {searched && hits.length > 0 && (
        <div className="flex flex-col gap-2">
          {(facets.trackList.length > 1 || facets.levelList.length > 1) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {facets.trackList.length > 1 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-dimmer">
                    track
                  </span>
                  {facets.trackList.map(([id, n]) => (
                    <Chip
                      key={id}
                      label={trackNames.get(id) ?? id.replace(/[-_]/g, " ")}
                      count={n}
                      active={trackFilter.has(id)}
                      onClick={() => toggleTrack(id)}
                    />
                  ))}
                </div>
              )}
              {facets.levelList.length > 1 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-dimmer">
                    level
                  </span>
                  {facets.levelList.map(([level, n]) => (
                    <Chip
                      key={level}
                      label={level}
                      count={n}
                      active={levelFilter.has(level)}
                      onClick={() => toggleLevel(level)}
                    />
                  ))}
                </div>
              )}
              {activeFilters > 0 && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="ml-auto shrink-0 font-mono text-[10px] text-ink-dim underline decoration-dotted underline-offset-2 hover:text-fg"
                >
                  {activeFilters} active · clear all
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {searched && busy && hits.length === 0 && (
        <p className="rounded-xl border border-line bg-surface-1 px-4 py-6 text-center font-mono text-[12.5px] text-ink-dimmer">
          Searching…
        </p>
      )}

      {searched && !busy && hits.length === 0 && (
        <div className="rounded-xl border border-line bg-surface-1 px-4 py-5">
          <p className="text-center font-mono text-[12.5px] text-ink-dim">
            Nothing matched <span className="text-fg">“{q.trim()}”</span>.
          </p>
          <p className="mt-1.5 text-center text-[11.5px] leading-relaxed text-ink-dimmer">
            Search covers titles, summaries and full lesson text, and every word must appear.
          </p>

          {suggestions.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
              <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-dimmer">
                try
              </span>
              {suggestions.map((s) => (
                <Chip
                  key={s}
                  label={s}
                  onClick={() => {
                    remember(s);
                    setQ(s);
                  }}
                />
              ))}
            </div>
          )}

          {suggestions.length === 0 && (
            <p className="mt-3 text-center text-[11.5px] text-ink-dimmer">
              Try a broader term — one distinctive word usually beats a phrase.
            </p>
          )}

          {tracks.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5 border-t border-line pt-3">
              <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-dimmer">
                browse
              </span>
              {tracks.map((t) => (
                <a
                  key={t.id}
                  href={`/track/${t.id}`}
                  className="rounded-full border border-line bg-surface-2 px-2.5 py-1 font-mono text-[10.5px] text-ink-dim transition hover:border-line-2 hover:text-fg"
                >
                  {t.title}
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {searched && hits.length > 0 && visible.length === 0 && (
        <div className="rounded-xl border border-line bg-surface-1 px-4 py-5 text-center font-mono text-[12.5px] text-ink-dim">
          All {hits.length} hits are hidden by the filters.
          <button
            type="button"
            onClick={clearFilters}
            className="ml-2 underline decoration-dotted underline-offset-2 text-brand hover:text-fg"
          >
            clear all
          </button>
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {visible.map((h) => (
          <a
            key={h.topic_id}
            href={`/topic/${h.topic_id}`}
            onClick={() => remember(q)}
            className="group rounded-xl border border-line bg-surface-1 p-4 transition hover:border-line-2 hover:bg-surface-2"
          >
            <div className="mb-1 flex items-center gap-2">
              <span className="font-mono text-[10px] text-ink-dimmer">{h.rank}.</span>
              <span className="text-[14px] font-semibold text-fg">{h.title}</span>
              <span className="ml-auto flex shrink-0 gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-dimmer">
                {h.track_id && <span className="rounded bg-surface-3 px-1.5 py-0.5">{h.track_id}</span>}
                {h.difficulty && <span className="rounded bg-surface-3 px-1.5 py-0.5">{h.difficulty}</span>}
              </span>
            </div>
            <p
              className="search-snippet text-[12.5px] leading-relaxed text-ink-dim [&_mark]:rounded-sm [&_mark]:bg-brand/25 [&_mark]:px-0.5 [&_mark]:text-fg"
              dangerouslySetInnerHTML={{ __html: h.snippet }}
            />
          </a>
        ))}
      </div>
    </div>
  );
}
