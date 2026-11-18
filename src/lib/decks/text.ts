import katex from "katex";
import type { Scope } from "./expr";

export const fmt = (n: number) => (!Number.isFinite(n) ? "∞" : Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(2));

/** Replace {name} with the live value of that name. */
export const fill = (s: string, scope: Scope) =>
  s.replace(/\{(\w+)\}/g, (_, k) => (k in scope ? (Number.isInteger(scope[k]) ? String(scope[k]) : fmt(scope[k])) : `{${k}}`));

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Inline markup: **bold**, $tex$. HTML in the source is escaped first. */
export function inline(s: string, throwOnError = false): string {
  return esc(s)
    .replace(/\$([^$]+)\$/g, (_, t) => katex.renderToString(t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"), { throwOnError }))
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/`([^`]+)`/g, '<code class="rounded bg-surface-3 px-1 font-mono text-[0.9em] text-fg">$1</code>');
}

export const tex = (t: string, display = false, throwOnError = false) => katex.renderToString(t, { throwOnError, displayMode: display });
