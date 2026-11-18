/** Display order and copy for lesson tracks. Unknown tracks sort last under their own id. */
export const TRACKS: { id: string; title: string; blurb: string }[] = [
  { id: "path", title: "8-week job path", blurb: "Maths, Python, ML, LLM apps, RAG, agents and deployment, day by day." },
  { id: "dsa", title: "Data structures and algorithms", blurb: "The patterns behind coding interviews, with step-through animations." },
  { id: "interview", title: "Interview prep", blurb: "Stories, ML and LLM questions, system design, live coding." },
  { id: "deep", title: "Deep dives: LLMs and deep learning", blurb: "How transformers, training, serving and the rest really work, one idea per lesson." },
];

export const trackTitle = (id: string) => TRACKS.find((t) => t.id === id)?.title ?? id;
export const trackRank = (id: string) => { const i = TRACKS.findIndex((t) => t.id === id); return i < 0 ? TRACKS.length : i; };
