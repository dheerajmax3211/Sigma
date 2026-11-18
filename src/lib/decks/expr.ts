/**
 * Tiny safe expression evaluator for deck data: numbers, names, + - * / ^,
 * parentheses and a few functions. No eval, no property access.
 */
export type Scope = Record<string, number>;

const FNS: Record<string, (...a: number[]) => number> = {
  sqrt: Math.sqrt, abs: Math.abs, exp: Math.exp, log: Math.log, max: Math.max, min: Math.min,
  tanh: Math.tanh, ceil: Math.ceil, floor: Math.floor, round: Math.round, sin: Math.sin, cos: Math.cos, sigmoid: (x) => 1 / (1 + Math.exp(-x)),
  // pick(i, a, b, c, ...) is the i-th value (rounded, clamped): lets a slider replay any hand-made trace.
  pick: (i, ...vs) => vs[Math.min(vs.length - 1, Math.max(0, Math.round(i)))],
};

function tokenize(src: string): string[] {
  const t = src.match(/\d+\.?\d*(?:e[+-]?\d+)?|[A-Za-z_]\w*|[-+*/^(),]|\S/gi);
  if (!t || t.join("").length !== src.replace(/\s+/g, "").length) throw new Error(`bad expression: ${src}`);
  return t;
}

export function evaluate(src: string, scope: Scope): number {
  const t = tokenize(src);
  let i = 0;
  const peek = () => t[i];
  const eat = (x?: string) => {
    if (x && t[i] !== x) throw new Error(`expected "${x}" in: ${src}`);
    return t[i++];
  };
  const expr = (): number => {
    let v = term();
    while (peek() === "+" || peek() === "-") v = eat() === "+" ? v + term() : v - term();
    return v;
  };
  const term = (): number => {
    let v = unary();
    while (peek() === "*" || peek() === "/") v = eat() === "*" ? v * unary() : v / unary();
    return v;
  };
  const unary = (): number => (peek() === "-" ? (eat(), -unary()) : power());
  const power = (): number => {
    const b = atom();
    return peek() === "^" ? (eat(), b ** unary()) : b;
  };
  const atom = (): number => {
    const k = eat();
    if (k === undefined) throw new Error(`unexpected end in: ${src}`);
    if (k === "(") { const v = expr(); eat(")"); return v; }
    if (/^\d/.test(k)) return Number(k);
    if (/^[A-Za-z_]/.test(k)) {
      if (peek() === "(") {
        eat("(");
        const args: number[] = [];
        if (peek() !== ")") { args.push(expr()); while (peek() === ",") { eat(); args.push(expr()); } }
        eat(")");
        const fn = FNS[k];
        if (!fn) throw new Error(`unknown function ${k}`);
        return fn(...args);
      }
      if (!(k in scope)) throw new Error(`unknown name "${k}" in: ${src}`);
      return scope[k];
    }
    throw new Error(`unexpected "${k}" in: ${src}`);
  };
  const v = expr();
  if (i < t.length) throw new Error(`trailing "${t[i]}" in: ${src}`);
  return v;
}

/** Names an expression refers to (for validation). */
export function names(src: string): string[] {
  return (src.match(/[A-Za-z_]\w*/g) ?? []).filter((n) => !(n in FNS) && !/^e\d/i.test(n));
}
