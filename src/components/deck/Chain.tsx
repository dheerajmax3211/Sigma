"use client";

import { useId } from "react";
import { evaluate, type Scope } from "@/lib/decks/expr";
import { fmt } from "@/lib/decks/text";
import type { ChainViewT } from "@/lib/decks/schema";

/** Animated node chain. Teal pulses flow forward; orange blame pulses flow back, faster for bigger gradients. */
export function Chain({ view, scope, blame }: { view: ChainViewT; scope: Scope; blame: number | "all" | "none" }) {
  const uid = useId().replace(/:/g, "");
  const n = view.nodes.length;
  const gap = 540 / (n - 1);
  const R = Math.min(44, gap / 2 - 14);
  const xs = view.nodes.map((_, i) => 70 + i * gap);
  const shown = (at: number) => blame === "all" || (typeof blame === "number" && blame >= at);
  const anyBlame = view.edges.some((e) => e.blame && shown(e.blameAt));
  return (
    <svg viewBox="0 0 680 190" className="w-full" role="img" aria-label="Animated chain showing values flowing forward and blame flowing backward">
      <defs>
        <filter id={`g${uid}`}><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      {view.edges.map((e, k) => {
        const x1 = xs[k] + R, x2 = xs[k + 1] - R, id = `${uid}p${k}`;
        const bv = e.blame && shown(e.blameAt) ? evaluate(e.blame, scope) : null;
        return (
          <g key={k}>
            <path id={id} d={`M${x1} 95 H${x2}`} stroke="#334155" strokeWidth={3} />
            <path id={`${id}b`} d={`M${x2} 95 H${x1}`} stroke="none" />
            {[0, 1, 2].map((d) => (
              <circle key={d} r={4} fill="#1cd6ac" filter={`url(#g${uid})`}>
                <animateMotion dur="2.4s" begin={`${d * 0.8}s`} repeatCount="indefinite"><mpath href={`#${id}`} /></animateMotion>
              </circle>
            ))}
            {bv !== null && [0, 1, 2].map((d) => (
              <circle key={`b${d}`} r={5} fill="#f97316" filter={`url(#g${uid})`}>
                <animateMotion dur={`${Math.max(0.7, 2.6 - Math.abs(bv) * 0.15)}s`} begin={`${d * 0.5}s`} repeatCount="indefinite"><mpath href={`#${id}b`} /></animateMotion>
              </circle>
            ))}
            {e.label && <text x={(x1 + x2) / 2} y={78} textAnchor="middle" fill="#7dd3fc" fontSize={14} fontWeight={700}>{e.label}{e.value ? ` = ${fmt(evaluate(e.value, scope))}` : ""}</text>}
            {bv !== null && e.label && <text x={(x1 + x2) / 2} y={128} textAnchor="middle" fill="#fb923c" fontSize={12}>blame {fmt(bv)}</text>}
          </g>
        );
      })}
      {view.nodes.map((nd, i) => (
        <g key={i}>
          <circle cx={xs[i]} cy={95} r={R} fill="#0b0f16" stroke={nd.color} strokeWidth={2.5} filter={`url(#g${uid})`} />
          <text x={xs[i]} y={86} textAnchor="middle" fill="#9aa4b2" fontSize={11}>{nd.label}</text>
          <text x={xs[i]} y={110} textAnchor="middle" fill="#f1f5f9" fontSize={19} fontWeight={700}>{fmt(evaluate(nd.value, scope))}</text>
        </g>
      ))}
      <text x={20} y={178} fill="#1cd6ac" fontSize={11}>● forward: values flow →</text>
      {anyBlame && <text x={200} y={178} fill="#f97316" fontSize={11}>● backward: blame flows ←</text>}
    </svg>
  );
}
