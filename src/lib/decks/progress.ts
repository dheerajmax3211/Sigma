// Browser-only progress for the 8-week path. localStorage can throw (private mode), so every access is guarded.
const DONE = "sigma-done";
const START = "sigma-start";

export function readDone(): string[] {
  try { return JSON.parse(localStorage.getItem(DONE) ?? "[]"); } catch { return []; }
}

export function markDone(id: string) {
  try {
    const done = readDone();
    if (!done.includes(id)) localStorage.setItem(DONE, JSON.stringify([...done, id]));
  } catch { /* progress is a convenience, never block the lesson */ }
}

/** Day number on the 56-day path, counting the first visit as day 1. */
export function pathDay(now = Date.now()): number {
  try {
    const start = Number(localStorage.getItem(START)) || now;
    localStorage.setItem(START, String(start));
    return Math.min(56, Math.floor((now - start) / 86_400_000) + 1);
  } catch { return 1; }
}
