import type { Deck } from "./schema";
import { evaluate, type Scope } from "./expr";
import { inline, tex } from "./text";

export const MAX_WORDS = 140;
export const MAX_SENTENCE = 30;

const SKIP = new Set(["kind", "tex", "color", "href", "expr", "blame", "set", "track", "rate", "sliders", "id", "min", "max", "step", "init", "fn", "point", "x", "y", "on", "slope", "code", "lang", "starter", "solution", "entry", "input", "expected", "at", "from", "to", "values", "order", "step", "node", "a", "b", "w", "cells", "rows", "rowLabels", "colLabels", "fill", "label", "says", "saysAt", "frames", "frame"]);
function strings(v: unknown, out: { text: string[]; tex: string[] } = { text: [], tex: [] }, key = "") {
  if (typeof v === "string") (key === "tex" ? out.tex : out.text).push(...(SKIP.has(key) && key !== "tex" ? [] : [v]));
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out, key));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) strings(x, out, k);
  return out;
}

/** Returns a list of problems; empty means the deck is shippable. */
export function checkDeck(deck: Deck): string[] {
  const errs: string[] = [];
  const err = (c: string, m: string) => errs.push(`[${deck.id}] ${c}: ${m}`);
  const scope: Scope = Object.fromEntries(deck.params.map((p) => [p.id, p.init]));
  for (const d of deck.derived) {
    try { scope[d.id] = evaluate(d.expr, scope); } catch (e) { err(`derived ${d.id}`, String(e)); }
  }
  const ev = (where: string, expr: string, extra: Scope = {}) => {
    try {
      const v = evaluate(expr, { ...scope, ...extra });
      if (!Number.isFinite(v)) err(where, `"${expr}" is not finite at the starting values`);
    } catch (e) { err(where, String(e)); }
  };
  const refs = (where: string, text: string) => {
    for (const m of text.matchAll(/\{(\w+)\}/g)) if (!(m[1] in scope)) err(where, `{${m[1]}} is not a param or derived value`);
  };

  deck.cards.forEach((c, i) => {
    const w = `card ${i + 1} (${c.kind})`;
    const s = strings(c);
    const words = s.text.join(" ").split(/\s+/).filter(Boolean).length;
    if (words > MAX_WORDS) err(w, `${words} words; limit is ${MAX_WORDS}`);
    s.text.forEach((t) => { refs(w, t); try { inline(t, true); } catch (e) { err(w, `bad $tex$ in "${t.slice(0, 40)}": ${e}`); } });
    s.tex.forEach((t) => { try { tex(t, false, true); } catch (e) { err(w, `bad tex "${t}": ${e}`); } });
    if (c.kind === "lab" || c.kind === "reveal") {
      for (const v of c.kind === "lab" ? [c.view, c.also] : [c.view]) {
        if (!v) continue;
        if (v.type === "chain") {
          v.nodes.forEach((n) => ev(w, n.value));
          v.edges.forEach((e) => { if (e.value) ev(w, e.value); if (e.blame) ev(w, e.blame); });
        } else if (v.type === "vectors") v.arrows.forEach((a) => { ev(w, a.x); ev(w, a.y); });
        else if (v.type === "curve") { ev(w, v.fn, { t: v.min }); ev(w, v.fn, { t: v.max }); ev(w, v.point); if (v.slope) ev(w, v.slope); }
        else if (v.type === "bars") v.items.forEach((b) => { ev(w, b.value); if (b.on) ev(w, b.on); });
        else if (v.type === "array") { if (v.frames) { if (!v.frame) err(w, "frames needs frame"); else ev(w, v.frame); if (v.frames.some((f) => f.length !== v.frames![0].length)) err(w, "array frames differ in length"); } v.pointers.forEach((p) => ev(w, p.at)); v.windows.forEach((x) => { ev(w, x.from); ev(w, x.to); }); }
        else if (v.type === "tree") { ev(w, v.step); v.order.forEach((k) => { if (k >= v.values.length || v.values[k] === null) err(w, `tree order index ${k} is not a node`); }); }
        else if (v.type === "graph") {
          ev(w, v.step); const ids = new Set(v.nodes.map((n) => n.id));
          v.edges.forEach((e) => { if (!ids.has(e.a) || !ids.has(e.b)) err(w, `edge ${e.a}-${e.b} names an unknown node`); });
          v.order.forEach((o) => { if (!ids.has(o.node) || (o.from && !ids.has(o.from))) err(w, `order names unknown node "${o.node}"`); });
        } else if (v.type === "grid") { ev(w, v.fill); if (new Set(v.rows.map((r) => r.length)).size > 1) err(w, "grid rows have different lengths"); }
      }
    }
    if (c.kind === "lab") {
      if (c.says.length && !c.saysAt) err(w, "says needs saysAt");
      if (c.saysAt) ev(w, c.saysAt);
      c.says.forEach((t) => { refs(w, t); const n = t.split(/\s+/).length; if (n > 40) err(w, `a says line has ${n} words; limit 40`); try { inline(t, true); } catch (e) { err(w, `bad $tex$ in says: ${e}`); } });
      c.sliders.forEach((id) => { if (!deck.params.some((p) => p.id === id)) err(w, `slider "${id}" is not a param`); });
      if (c.action) {
        if (!(c.action.track in scope)) err(w, `track "${c.action.track}" unknown`);
        for (const [k, e] of Object.entries(c.action.set)) { if (!deck.params.some((p) => p.id === k)) err(w, `action sets unknown param "${k}"`); ev(w, e, { rate: 0.02 }); }
      }
    }
    if (c.kind === "formula") {
      c.symbols.forEach((y) => y.value && ev(w, y.value));
      if (!c.verify.length) err(w, "formula needs at least one `verify` (a hand-computed number)");
      for (const v of c.verify) {
        try {
          const got = evaluate(v.expr, scope);
          if (!(Math.abs(got - v.equals) <= v.tol)) err(w, `verify "${v.expr}" gives ${got}, expected ${v.equals}`);
        } catch (e) { err(w, String(e)); }
      }
    }
    for (const t of s.text) for (const sent of t.split(/(?<=[.!?])\s+/)) {
      const n = sent.split(/\s+/).filter(Boolean).length;
      if (n > MAX_SENTENCE) err(w, `sentence of ${n} words (limit ${MAX_SENTENCE}): "${sent.slice(0, 50)}..."`);
    }
    if (c.kind === "practice") {
      for (const t of c.tests) for (const j of [t.input, t.expected]) { try { JSON.parse(j); } catch { err(w, `test value is not JSON: ${j}`); } }
      if (c.starter === c.solution) err(w, "starter equals solution");
    }
    if (c.kind === "check" && c.options.filter((o) => o.correct).length !== 1) err(w, "needs exactly one correct option");
  });

  const kinds = new Set(deck.cards.map((c) => c.kind));
  if (deck.cards[0].kind !== "story") err("deck", "first card must be a story (analogy before symbols)");
  if (!kinds.has("lab")) err("deck", "needs at least one lab (something to drag)");
  if (!kinds.has("check")) err("deck", "needs at least one check question");
  if (!kinds.has("formula") && !kinds.has("reveal") && !kinds.has("code")) err("deck", "needs a formula, reveal or code card");
  const run = Math.max(...deck.cards.map((c, i) => { let n = 0, j = i; while (j < deck.cards.length && deck.cards[j].kind === "story") { n++; j++; } return n; }));
  if (run > 2) err("deck", `${run} story cards in a row; add a picture or interaction`);
  return errs;
}
