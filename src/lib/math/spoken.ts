/**
 * TeX → spoken English.
 *
 * The complaint that started this: a learner met
 *
 *   ‖A − A_k‖_F = √(Σ_{i>k} σᵢ²) = √0.113803
 *
 * and could not say it. Symbol chips name the parts but never the sentence, and
 * a formula you cannot say is a formula you cannot rehearse or defend in a viva.
 *
 * Authoring a spoken line for every formula would mean thousands of hand-written
 * strings that drift the moment the maths changes. So this reads the TeX itself.
 * It is deliberately conservative: it handles the constructs that carry meaning —
 * fractions, roots, sums and products with limits, norms, powers, subscripts,
 * functions and comparison operators — and when it meets something it does not
 * understand it returns null rather than inventing a sentence. A confident wrong
 * reading is worse than none.
 */

const GREEK: Record<string, string> = {
  alpha: "alpha", beta: "beta", gamma: "gamma", delta: "delta", epsilon: "epsilon",
  varepsilon: "epsilon", zeta: "zeta", eta: "eta", theta: "theta", iota: "iota",
  kappa: "kappa", lambda: "lambda", mu: "mu", nu: "nu", xi: "xi", pi: "pi",
  rho: "rho", sigma: "sigma", tau: "tau", upsilon: "upsilon", phi: "phi",
  varphi: "phi", chi: "chi", psi: "psi", omega: "omega",
  Gamma: "capital gamma", Delta: "capital delta", Theta: "capital theta",
  Lambda: "capital lambda", Xi: "capital xi", Pi: "capital pi", Sigma: "capital sigma",
  Phi: "capital phi", Psi: "capital psi", Omega: "capital omega",
};

const OPERATORS: Record<string, string> = {
  cdot: "times", times: "times", div: "divided by", pm: "plus or minus",
  approx: "approximately equals", neq: "is not equal to", leq: "less than or equal to",
  geq: "greater than or equal to", le: "less than or equal to", ge: "greater than or equal to",
  ll: "much less than", gg: "much greater than", propto: "is proportional to",
  in: "in", notin: "not in", subset: "is a subset of", cup: "union", cap: "intersection",
  to: "goes to", rightarrow: "goes to", mapsto: "maps to", implies: "implies",
  equiv: "is equivalent to", sim: "is distributed as", perp: "perpendicular to",
  oplus: "oplus", otimes: "outer product", circ: "composed with",
  nabla: "del", partial: "partial", infty: "infinity", ldots: "and so on",
  mid: "given", because: "because", therefore: "therefore", forall: "for all",
  exists: "there exists", neg: "not", land: "and", lor: "or", setminus: "minus",
  star: "star", ast: "star", prime: "prime", ell: "l", hbar: "h bar",
  iff: "if and only if", Rightarrow: "implies", Longrightarrow: "implies",
  lim: "the limit of", arg: "the argument of", gcd: "the gcd of", sup: "the supremum of",
  lesssim: "is less than or about", bmod: "modulo", boxed: "boxed",
  longrightarrow: "goes to", Longleftarrow: "is implied by", ne: "is not equal to",
  varnothing: "the empty set", inf: "the infimum of", succ: "succeeds",
  preceq: "precedes or equals", succeq: "succeeds or equals", cr: " ", wedge: "wedge", Longleftrightarrow: "if and only if",
  leftarrow: "goes to", top: "transpose", odot: "elementwise times",
  langle: "the inner product of", rangle: "with",
  lfloor: "floor of", rfloor: "end floor", lceil: "ceiling of", rceil: "end ceiling",
  cdots: "and so on", dots: "and so on", quad: " ", qquad: " ",
};

/** Function names as they read in a subscript or limit. */
const SHORT: Record<string, string> = {
  max: "max", min: "min", log: "log", exp: "exp", argmax: "argmax",
  argmin: "argmin", lim: "lim", sup: "sup", inf: "inf", det: "det", dim: "dim",
  softmax: "softmax", tanh: "tanh", relu: "relu",
};

const FUNCTIONS: Record<string, string> = {
  log: "log", ln: "natural log", exp: "exp of", max: "the maximum of", min: "the minimum of",
  argmax: "the argmax of", argmin: "the argmin of", softmax: "softmax of", sin: "sine of",
  cos: "cosine of", tan: "tangent of", det: "the determinant of", dim: "the dimension of",
  tanh: "tanh of", relu: "relu of", Pr: "the probability that",
};

/** Reads a braced group starting at `i`, or a single token. Returns text and next index. */
function takeGroup(tex: string, i: number): { body: string; next: number } | null {
  // Multi-line display maths puts a newline and indentation between a
  // \frac's numerator and denominator; skipping only spaces made every such
  // fraction unreadable.
  while (i < tex.length && /\s/.test(tex[i])) i++;
  if (tex[i] === "{") {
    let depth = 0;
    for (let j = i; j < tex.length; j++) {
      if (tex[j] === "{") depth++;
      else if (tex[j] === "}") {
        depth--;
        if (depth === 0) return { body: tex.slice(i + 1, j), next: j + 1 };
      }
    }
    return null;
  }
  if (i >= tex.length) return null;
  // A command is one unit: \bar\alpha must take "\alpha", not a lone backslash.
  const cmd = tex.slice(i).match(/^\\[A-Za-z]+/);
  if (cmd) return { body: cmd[0], next: i + cmd[0].length };
  return { body: tex[i], next: i + 1 };
}

/** Digits, decimal points and signs read as themselves. */
function readNumber(s: string): string | null {
  return /^-?\d+(\.\d+)?$/.test(s.trim()) ? s.trim() : null;
}

/**
 * Turns one TeX expression into a sentence fragment. Returns null when the
 * expression contains something this reader does not model.
 */
export function speakTex(tex: string): string | null {
  // Some authored formulas double-escape commands (\\sigma). The renderer
  // normalises them, so the reader must too — otherwise every such formula
  // fails for a reason that has nothing to do with the mathematics.
  tex = tex.replace(/\\\\+(?=[A-Za-z])/g, "\\");

  const out: string[] = [];
  let i = 0;
  let unresolved = false;

  const push = (word: string) => {
    const w = word.trim();
    if (!w) return;
    out.push(w);
  };

  // The last produced word, so superscripts can attach ("sigma sub i squared").
  const attach = (suffix: string) => {
    if (out.length === 0) {
      push(suffix);
      return;
    }
    out[out.length - 1] = `${out[out.length - 1]} ${suffix}`;
  };

  while (i < tex.length) {
    const ch = tex[i];

    // Display maths in these files is often multi-line; a newline is just a space.
    if (/\s/.test(ch)) { i++; continue; }

    // \| ... \| and \| ... \|_F — norms
    if (tex.startsWith("\\|", i)) {
      const close = tex.indexOf("\\|", i + 2);
      if (close === -1) {
        // A single \| inside P\\|Q is "given", not an unclosed norm.
        push("given");
        i += 2;
        continue;
      }
      const inner = speakTex(tex.slice(i + 2, close));
      if (inner === null) return null;
      let next = close + 2;
      let kind = "the norm of";
      const sub = tex.slice(next).match(/^_\{?([A-Za-z0-9])\}?/);
      if (sub) {
        if (sub[1] === "F") kind = "the Frobenius norm of";
        else if (sub[1] === "2") kind = "the Euclidean norm of";
        next += sub[0].length;
      }
      push(`${kind} ${inner}`);
      i = next;
      continue;
    }

    if (ch === "\\") {
      const m = tex.slice(i).match(/^\\([A-Za-z]+)/);
      if (!m) {
        const nxt = tex[i + 1];
        if (nxt === "$") {
          push("dollars");
          i += 2;
          continue;
        }
        // \\| inside D(P\\|Q) means "given", and the doubled form reaches here.
        if (nxt === "|") {
          push("given");
          i += 2;
          continue;
        }
        if (nxt === " " || nxt === "," || nxt === ";" || nxt === "!" || nxt === ":" || nxt === "\\") {
          i += 2;
          continue;
        }
        i++;
        continue;
      }
      const name = m[1];
      i += m[0].length;

      if (name === "frac" || name === "dfrac" || name === "tfrac") {
        const a = takeGroup(tex, i); if (!a) return null;
        const b = takeGroup(tex, a.next); if (!b) return null;
        const na = speakTex(a.body), nb = speakTex(b.body);
        if (na === null || nb === null) return null;
        push(`${na} over ${nb}`);
        i = b.next;
        continue;
      }

      if (name === "sqrt") {
        // Optional index: \sqrt[3]{x}
        let body = takeGroup(tex, i);
        if (!body) return null;
        const idx = tex.slice(i).match(/^\[([^\]]+)\]/);
        if (idx) {
          const inner = takeGroup(tex, i + idx[0].length);
          if (!inner) return null;
          const n = speakTex(inner.body);
          if (n === null) return null;
          push(`the ${speakTex(idx[1]) ?? idx[1]} root of ${n}`);
          i = inner.next;
          continue;
        }
        const n = speakTex(body.body);
        if (n === null) return null;
        push(`the square root of ${n}`);
        i = body.next;
        continue;
      }

      if (name === "sum" || name === "prod" || name === "int") {
        let low = ""; let high = "";
        // _{...}^{...}
        const lm = tex.slice(i).match(/^(?:_\{([^{}]*)\}|_([A-Za-z0-9]))/);
        if (lm) {
          low = (lm[1] ?? lm[2]) as string;
          i += lm[0].length;
        }
        const hm = tex.slice(i).match(/^(?:\^\{([^{}]*)\}|\^([A-Za-z0-9])|\{([^{}]*)\})/);
        if (hm) {
          high = (hm[1] ?? hm[2] ?? hm[3]) as string;
          i += hm[0].length;
        }
        const lowSpoken = low ? speakTex(low) : null;
        const highSpoken = high ? speakTex(high) : null;
        const head = name === "sum" ? "the sum" : name === "prod" ? "the product" : "the integral";
        let phrase = head;
        if (lowSpoken) {
          // A limit that is a condition ("i > k") is not a range, so "from" would
          // read as nonsense: say "over i greater than k" instead.
          const isCondition = /[<>]|\\ge|\\le|\\geq|\\leq/.test(low);
          const cleaned = lowSpoken.replace(/ is (greater|less) than /g, " $1 than ");
          phrase += isCondition ? ` over ${cleaned}` : ` from ${cleaned}`;
        }
        if (highSpoken) phrase += ` to ${highSpoken}`;
        push(`${phrase} of`);
        continue;
      }

      if (name === "mathbb" || name === "mathcal" || name === "mathbf" || name === "text" || name === "mathrm") {
        const g = takeGroup(tex, i);
        if (!g) return null;
        const letter = g.body;
        const named: Record<string, string> = {
          E: "the expectation of", R: "the reals", N: "the naturals", Z: "the integers",
          L: "the loss", P: "the probability of", D: "the data distribution",
        };
        push(named[letter] ?? letter);
        i = g.next;
        continue;
      }

      if (name === "bar" || name === "overline" || name === "hat" || name === "tilde") {
        const g = takeGroup(tex, i);
        if (!g) return null;
        const inner = speakTex(g.body);
        if (inner === null) return null;
        const label = name === "bar" || name === "overline" ? "bar" : name;
        push(`${inner} ${label}`);
        i = g.next;
        continue;
      }

      if (name === "left" || name === "right" || name === "bigl" || name === "bigr" ||
          name === "Bigl" || name === "Bigr" || name === "displaystyle" ||
          name === "limits" || name === "nolimits" || name === "mathrm" ||
          name === "big" || name === "Big" || name === "bigg" || name === "Bigg" ||
          name === "middle" || name === "textstyle" || name === "scriptstyle" || name === "rm") {
        continue;
      }

      if (name === "begin") {
        const g = takeGroup(tex, i);
        if (!g) return null;
        const env = g.body.trim();
        const endTag = `\\end{${env}}`;
        const endAt = tex.indexOf(endTag, g.next);
        if (endAt === -1) return null;
        const inner = tex.slice(g.next, endAt);
        i = endAt + endTag.length;

        const rows = inner.split(/\\\\/).map((r) => r.trim()).filter(Boolean);
        const readRow = (r: string) =>
          r.split("&").map((c) => speakTex(c.trim())).filter((c): c is string => !!c);
        const isMatrix = /matrix|array/i.test(env);
        const isCases = /cases/i.test(env);
        const parts: string[] = [];
        rows.forEach((r, idx) => {
          const cells = readRow(r);
          if (!cells.length) return;
          if (isCases) parts.push(cells.length > 1 ? `${cells[0]}, if ${cells.slice(1).join(" and ")}` : cells[0]);
          else if (isMatrix) parts.push(`row ${idx + 1}: ${cells.join(", ")}`);
          else parts.push(cells.join(", "));
        });
        if (!parts.length) return null;
        push(
          isMatrix ? `the matrix with ${parts.join("; ")}`
          : isCases ? `cases: ${parts.join("; ")}`
          : parts.join("; "),
        );
        continue;
      }
      if (name === "end") return null;

      if (name === "lVert" || name === "rVert" || name === "lvert" || name === "rvert") {
        continue;
      }
      if (name === "binom") {
        const a = takeGroup(tex, i); if (!a) return null;
        const b = takeGroup(tex, a.next); if (!b) return null;
        const na = speakTex(a.body), nb = speakTex(b.body);
        if (na === null || nb === null) return null;
        push(`${na} choose ${nb}`);
        i = b.next;
        continue;
      }
      if (name === "overset" || name === "underset") {
        const a = takeGroup(tex, i); if (!a) return null;
        const b = takeGroup(tex, a.next); if (!b) return null;
        const nb = speakTex(b.body);
        if (nb === null) return null;
        push(nb);
        i = b.next;
        continue;
      }
      if (name === "xrightarrow" || name === "xleftarrow") {
        const opt = tex.slice(i).match(/^\[([^\]]*)\]/);
        let cond: string | null = null;
        if (opt) {
          cond = speakTex(opt[1]);
          i += opt[0].length;
        }
        const g = takeGroup(tex, i);
        let label: string | null = null;
        if (g) {
          label = speakTex(g.body);
          i = g.next;
        }
        const head = name === "xrightarrow" ? "goes to" : "goes back to";
        push([head, label, cond ? `as ${cond}` : ""].filter(Boolean).join(" "));
        continue;
      }

      if (name === "underbrace" || name === "overbrace" || name === "boldsymbol" ||
          name === "vec" || name === "mathfrak" || name === "mathsf" || name === "dot") {
        const g = takeGroup(tex, i);
        if (!g) return null;
        const inner = speakTex(g.body);
        if (inner === null) return null;
        push(name === "dot" ? `${inner} dot` : inner);
        i = g.next;
        continue;
      }

      if (name === "operatorname" || name === "text" || name === "textbf") {
        const g = takeGroup(tex, i);
        if (!g) return null;
        push(g.body);
        i = g.next;
        continue;
      }

      if (name === "log" || name === "ln" || name === "exp") {
        // \log p(x) has no braces around its argument, so read the next atom
        // rather than requiring a group.
        const g = takeGroup(tex, i);
        if (g) {
          const inner = speakTex(g.body);
          if (inner !== null) { push(`${FUNCTIONS[name]} ${inner}`); i = g.next; continue; }
        }
        push(FUNCTIONS[name]);
        continue;
      }

      if (name === "sum" || name === "prod" || name === "int" || name === "iint") {
        // handled below; keep the branch order explicit
      }

      if (GREEK[name]) { push(GREEK[name]); continue; }
      if (OPERATORS[name] !== undefined) { push(OPERATORS[name]); continue; }
      if (FUNCTIONS[name]) {
        const g = takeGroup(tex, i);
        if (!g) { push(FUNCTIONS[name]); continue; }
        const inner = speakTex(g.body);
        if (inner === null) {
          // A function applied to something we cannot read: name it, keep going.
          push(FUNCTIONS[name]);
          continue;
        }
        push(`${FUNCTIONS[name]} ${inner}`);
        i = g.next;
        continue;
      }
      // Unknown command: refuse rather than guess.
      unresolved = true;
      continue;
    }

    if (ch === "^" || ch === "_") {
      const g = takeGroup(tex, i + 1);
      if (!g) return null;
      if (g.body.trim() === "") {
        i = g.next;
        continue;
      }
      // A bare function name in a script reads short ("sub max", not "sub the maximum of").
      const bare = g.body.trim().match(/^\\([A-Za-z]+)$/);
      const inner = bare && SHORT[bare[1]] ? SHORT[bare[1]] : speakTex(g.body);
      if (inner === null) {
        // A decorative superscript (^{*}) is not worth losing the sentence for.
        i = g.next;
        continue;
      }
      if (ch === "^") {
        if (g.body.trim() === "2") attach("squared");
        else if (g.body.trim() === "3") attach("cubed");
        else if (g.body.trim() === "T" || g.body.trim() === "\\top" || g.body.trim() === "\\mathsf{T}") attach("transpose");
        else attach(`to the power ${inner}`);
      } else {
        attach(`sub ${inner}`);
      }
      i = g.next;
      continue;
    }

    if (ch === "{") {
      const g = takeGroup(tex, i);
      if (!g) return null;
      if (g.body.trim() === "") {
        i = g.next;
        continue;
      }
      const inner = speakTex(g.body);
      if (inner === null) return null;
      push(inner);
      i = g.next;
      continue;
    }

    if (ch === "=") { push("equals"); i++; continue; }
    if (ch === "+") { push("plus"); i++; continue; }
    if (ch === "-") { push("minus"); i++; continue; }
    if (ch === "<") { push("is less than"); i++; continue; }
    if (ch === ">") { push("is greater than"); i++; continue; }
    if (ch === ",") { push(","); i++; continue; }
    if (ch === "\\") {
      // Spacing and line-break escapes: \, \;, \!, \:, and a bare backslash.
      const nxt = tex[i + 1];
      if (nxt === " " || nxt === "," || nxt === ";" || nxt === "!" || nxt === ":" || nxt === "\\") {
        i += 2;
        continue;
      }
      // Escaped currency: \$ is a literal dollar sign in these cost formulas.
      if (nxt === "$") {
        push("dollars");
        i += 2;
        continue;
      }
    }
    if (ch === "%") { push("percent"); i++; continue; }
    // Punctuation that carries no spoken weight, and the one that does.
    if (ch === "." || ch === ";" || ch === ":" || ch === "!" || ch === "&" || ch === "|") { i++; continue; }
    if (ch === "/") { push("over"); i++; continue; }
    if (ch === "#") { push("the number of"); i++; continue; }
    if (ch === "$" || ch === "*") { i++; continue; }
    if (ch === "'") { push("prime"); i++; continue; }
    if (ch === "(" || ch === ")" || ch === "[") { i++; continue; }
    if (ch === "]") { i++; continue; }

    const num = tex.slice(i).match(/^\d+(\.\d+)?/);
    if (num) { push(num[0]); i += num[0].length; continue; }

    const word = tex.slice(i).match(/^[A-Za-z]+/);
    if (word) {
      const w = word[0];
      // Single letters are variables; longer runs are usually words in \text-like prose.
      push(w.length === 1 ? w : w);
      i += w.length;
      continue;
    }

    // Anything else (|, \, %, &) is not modelled.
    i++;
    unresolved = true;
  }

  if (unresolved) return null;
  const sentence = out.join(" ").replace(/\s+/g, " ").replace(/\s,/g, ",").trim();
  // Single letters and bare digits are legitimate here: `\frac{a}{b}` must read
  // as "a over b", and that means speaking "a" and "b" on their own.
  return sentence.length > 0 ? sentence : null;
}
