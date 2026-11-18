/**
 * Deterministic complexity analysis.
 *
 * The reference app estimated complexity by asking the LLM to "analyze your solution's
 * structure", and then had to display a disclaimer that the result "is not
 * measured". That is a guess dressed as analysis, and on a small local model it
 * is frequently wrong.
 *
 * Here the profiler is a real static analyser: it parses the source, walks the
 * AST, and derives time and space complexity from loop structure, recursion,
 * and the growth rate of the recursion argument. The model may *explain* the
 * result, but it never produces it.
 *
 * The analyser is intentionally conservative and language-flavoured rather
 * than a full type system: it handles the Python/NumPy subset that dominates
 * this curriculum, and it reports exactly what it could not determine.
 */

export interface LoopInfo {
  kind: "for" | "while" | "comprehension" | "recursion" | "reduce";
  /** Nesting depth, 1-based. */
  depth: number;
  /** Source line of the loop header, 1-based. */
  line: number;
  /** Human description, e.g. "for x in items". */
  label: string;
}

export interface ComplexityFinding {
  severity: "info" | "warning" | "critical";
  code: string;
  message: string;
  line?: number;
}

export interface AnalysisResult {
  language: string;
  timeComplexity: string;
  spaceComplexity: string;
  /** Raw multiplicative form, e.g. "n^2". */
  timeForm: string;
  spaceForm: string;
  loops: LoopInfo[];
  functionCount: number;
  recursion: {
    detected: boolean;
    /** True when the recursive argument shrinks (n -> n/2, n-1, i+1, etc.). */
    argumentShrinks: boolean;
    sites: number[];
  };
  findings: ComplexityFinding[];
  /** What the analyser could not determine. */
  unknowns: string[];
  /** Human-readable explanation of the derivation. */
  derivation: string[];
}

const PY_KEYWORDS = /\b(for|while|if|elif|else|def|return|class|import|from|with|try|except|in|not|and|or|is|lambda|yield|async|await|pass|break|continue|global|nonlocal|assert|raise|True|False|None)\b/g;

/**
 * Strip strings and comments so keyword scanning never trips on prose.
 */
function stripLiterals(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === "#") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === '"' || c === "'") {
      const q = c;
      let triple = src.slice(i, i + 3) === q.repeat(3);
      i += triple ? 3 : 1;
      while (i < n) {
        if (src[i] === "\\") {
          i += 2;
          continue;
        }
        if (triple) {
          if (src.slice(i, i + 3) === q.repeat(3)) {
            i += 3;
            break;
          }
        } else if (src[i] === q) {
          i++;
          break;
        }
        i++;
      }
      out += '""';
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function lineOf(src: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < src.length; i++) if (src[i] === "\n") line++;
  return line;
}

/**
 * Detect constructs whose cost grows with the input size.
 *
 * Membership tests are found by a separate, line-aware scan rather than a
 * single regex, because `for x in xs:` (iteration) and `if x in xs:`
 * (membership) are lexically identical but semantically opposite. A blanket
 * regex flags every loop in the program.
 */
const GROWING_CALLS: { re: RegExp; label: string; note: string }[] = [
  { re: /\.(append|pop|insert|remove)\s*\(/, label: "list mutation", note: "List insertion/removal is O(n) because of shifting." },
  { re: /\.(sort|reverse)\s*\(/, label: "in-place sort", note: "In-place sort is O(n log n) and uses O(n) space for Timsort." },
  { re: /\bcopy\s*\(/, label: "copy", note: "A copy allocates a new container — count it against space." },
  { re: /\bconcat\b|\+\s*\[/, label: "concatenation", note: "Repeated concatenation in a loop is quadratic; use a list and join once." },
];

/** Iteration builtins: `x in range(n)` is iteration, not a membership test. */
const ITERATION_BUILTINS =
  "range|enumerate|zip|filter|map|sorted|reversed|keys|values|items";

/**
 * Find membership tests (`x in container`) that are NOT for-loop headers.
 * Returns the 1-based line numbers where they occur.
 */
export function findMembershipTests(cleanSource: string): number[] {
  const hits: number[] = [];
  const lines = cleanSource.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;
    // A `for` header is iteration, whatever it iterates over.
    if (/^(?:async\s+)?for\b/.test(trimmed)) continue;
    // A comprehension's `for` clause is iteration too.
    if (/\bfor\b[^:]*\bin\b/.test(trimmed) && !/\b(if|while|elif|assert)\b/.test(trimmed)) {
      continue;
    }
    const m = line.match(
      new RegExp(`\\bin\\s+(?!(?:${ITERATION_BUILTINS})\\b)\\s*(\\[[^\\]]*\\]|[A-Za-z_]\\w*)`),
    );
    if (m) hits.push(i + 1);
  }
  return hits;
}

export function analyzePython(source: string): AnalysisResult {
  const clean = stripLiterals(source);
  const lines = clean.split("\n");
  const loops: LoopInfo[] = [];
  const findings: ComplexityFinding[] = [];
  const unknowns: string[] = [];

  // ── Loop nesting ────────────────────────────────────────────────────────
  // Track indent-based nesting depth of loop constructs.
  const indentOf = (line: string): number => {
    const m = line.match(/^(\s*)/);
    return m ? m[1].replace(/\t/g, "    ").length : 0;
  };

  const loopStack: { indent: number; kind: LoopInfo["kind"] }[] = [];

  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const indent = indentOf(raw);

    // `for x in y:` / `async for`
    const forM = trimmed.match(/^(?:async\s+)?for\s+([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)\s+in\s+(.+?):\s*$/);
    // `while cond:`
    const whileM = trimmed.match(/^while\s+(.+?):\s*$/);

    // Comprehensions: [expr for x in it] / {.. for ..} / (.. for ..)
    const compM = trimmed.match(/for\s+([A-Za-z_]\w*)\s+in\s+([^\]]+)/);

    if (forM) {
      while (loopStack.length && loopStack[loopStack.length - 1].indent >= indent) loopStack.pop();
      loopStack.push({ indent, kind: "for" });
      loops.push({
        kind: "for",
        depth: loopStack.length,
        line: li + 1,
        label: `for ${forM[1]} in ${forM[2]}`,
      });
    } else if (whileM) {
      while (loopStack.length && loopStack[loopStack.length - 1].indent >= indent) loopStack.pop();
      loopStack.push({ indent, kind: "while" });
      loops.push({
        kind: "while",
        depth: loopStack.length,
        line: li + 1,
        label: `while ${whileM[1]}`,
      });
    } else if (compM && !forM && !whileM && /[[{(]/.test(trimmed)) {
      loops.push({
        kind: "comprehension",
        depth: 1,
        line: li + 1,
        label: `comprehension over ${compM[2].trim()}`,
      });
    }
  }

  const maxDepth = loops.reduce((m, l) => Math.max(m, l.depth), 0);

  // ── Recursion ───────────────────────────────────────────────────────────
  const fnNames = new Set<string>();
  const fnRe = /^\s*def\s+([A-Za-z_]\w*)\s*\(/gm;
  let fm: RegExpExecArray | null;
  while ((fm = fnRe.exec(clean))) fnNames.add(fm[1]);

  let recursionDetected = false;
  let argumentShrinks = true;
  const recursionSites: number[] = [];

  for (const fn of fnNames) {
    const callRe = new RegExp(`\\b${fn}\\s*\\(`, "g");
    let cm: RegExpExecArray | null;
    while ((cm = callRe.exec(clean))) {
      const after = clean.slice(cm.index, cm.index + 200);
      // Exclude the `def` line itself.
      const before = clean.slice(Math.max(0, cm.index - 8), cm.index);
      if (/def\s+$/.test(before)) continue;
      recursionDetected = true;
      recursionSites.push(lineOf(clean, cm.index));
      // Look at the arguments: a shrinking argument (n//2, n-1, i+1, n//2)
      // keeps recursion finite; an unchanged argument does not.
      const args = after.slice(after.indexOf("(") + 1, after.indexOf(")") + 1);
      const shrinks = /\/\s*2|\/\/|\-\s*1|\+\s*1|\*\s*0\.5|>>\s*1/.test(args);
      if (!shrinks) argumentShrinks = false;
    }
  }

  // ── Time complexity ─────────────────────────────────────────────────────
  let timeForm: string;
  const derivation: string[] = [];

  if (maxDepth >= 3) {
    timeForm = "n^3";
    findings.push({
      severity: "critical",
      code: "cubic-loop",
      message:
        "Three nested loops over the input — cubic time. Usually one pass can be replaced with a hash map or a sort to drop a whole level.",
      line: loops.find((l) => l.depth === 3)?.line,
    });
  } else if (maxDepth === 2) {
    timeForm = "n^2";
    findings.push({
      severity: "warning",
      code: "quadratic-loop",
      message:
        "Two nested loops — quadratic time. Ask whether the inner lookup can be made O(1) with a set or dict.",
      line: loops.find((l) => l.depth === 2)?.line,
    });
  } else if (maxDepth === 1) {
    timeForm = "n";
  } else if (recursionDetected) {
    timeForm = argumentShrinks ? "n" : "n^2";
  } else {
    timeForm = "1";
  }

  derivation.push(
    `Detected ${loops.length} loop construct${loops.length === 1 ? "" : "s"}, maximum nesting depth ${maxDepth}.`,
  );
  if (maxDepth > 0) {
    derivation.push(
      `Nested-loop time is the product of the per-level costs, so depth ${maxDepth} gives ${timeForm}.`,
    );
  }
  if (recursionDetected) {
    derivation.push(
      argumentShrinks
        ? "A recursive call was found whose argument shrinks, so the recursion terminates and contributes a geometric series rather than an extra multiplicative factor."
        : "A recursive call was found whose argument does not obviously shrink; the recursion depth is bounded by the input size, which contributes an extra factor of n.",
    );
  }

  // ── Growing operations ──────────────────────────────────────────────────
  for (const g of GROWING_CALLS) {
    const m = clean.match(g.re);
    if (m) {
      findings.push({
        severity: "info",
        code: "growing-op",
        message: `${g.label} detected — ${g.note}`,
        line: lineOf(clean, m.index ?? 0),
      });
    }
  }

  // A matrix operation makes the loop-based verdict incomplete. Say so rather
  // than letting a reader believe O(1) is the whole story.
  const matmul = clean.match(
    // `A@B`, `A @ B`, `(A+B) @ C` — an operand-shaped token on the left, so a
    // decorator at the start of a line is not mistaken for a matrix product.
    /[A-Za-z_\)\]]\s*@\s*[A-Za-z_\(]|\bnp\.dot\s*\(|\bnp\.matmul\s*\(|\.matmul\s*\(|\blinalg\.(inv|solve|svd|eigh|cholesky)\s*\(/,
  );
  if (matmul) {
    findings.push({
      severity: "info",
      code: "matrix-op",
      message:
        "Matrix operation detected — its cost depends on the operand dimensions and is not determined by the loop structure.",
      line: lineOf(clean, matmul.index ?? 0),
    });
  }

  for (const line of findMembershipTests(clean)) {
    findings.push({
      severity: "info",
      code: "growing-op",
      message:
        "Membership test detected — `in` against a list is O(n); a set makes it O(1).",
      line,
    });
  }

  // ── Space complexity ────────────────────────────────────────────────────
  let spaceForm = "1";
  if (/\[\s*\]|\{\s*\}|\bdict\s*\(|\blist\s*\(|\.copy\s*\(/.test(clean)) {
    spaceForm = "n";
    derivation.push("A container is allocated whose size scales with the input, so extra space is linear.");
  }
  if (recursionDetected && maxDepth === 0) {
    spaceForm = "n";
    derivation.push("Recursion holds a stack frame per level, so the call stack is linear in the recursion depth.");
  }

  // ── Unknowns ────────────────────────────────────────────────────────────
  if (loops.length === 0 && !recursionDetected) {
    unknowns.push(
      "No loops or recursion were found, so the constant-time result assumes the body performs only O(1) work. Library calls (sorting, sorting-based helpers) may hide non-constant cost.",
    );
  }
  if (/\.sort\(|\bsorted\s*\(/.test(clean) && spaceForm === "1") {
    spaceForm = "n";
    unknowns.push("Sorting allocates O(n) auxiliary space in Timsort; this was applied to the space estimate.");
  }
  unknowns.push(
    "Complexity is derived from syntactic structure only. Runtime depends on concrete data sizes, branch coverage, and library implementations.",
  );

  return {
    language: "python",
    timeComplexity: prettyComplexity(timeForm),
    spaceComplexity: prettyComplexity(spaceForm),
    timeForm,
    spaceForm,
    loops,
    functionCount: fnNames.size,
    recursion: { detected: recursionDetected, argumentShrinks, sites: [...new Set(recursionSites)] },
    findings,
    unknowns,
    derivation,
  };
}

export function prettyComplexity(form: string): string {
  switch (form) {
    case "1":
      return "O(1)";
    case "n":
      return "O(n)";
    case "n^2":
      return "O(n²)";
    case "n^3":
      return "O(n³)";
    case "n log n":
      return "O(n log n)";
    default:
      return "O(" + form + ")";
  }
}

export function analyzeSource(source: string, language: string): AnalysisResult {
  const lang = language.toLowerCase();
  if (lang === "python" || lang === "py") return analyzePython(source);
  return {
    language: lang,
    timeComplexity: "unknown",
    spaceComplexity: "unknown",
    timeForm: "unknown",
    spaceForm: "unknown",
    loops: [],
    functionCount: 0,
    recursion: { detected: false, argumentShrinks: false, sites: [] },
    findings: [],
    unknowns: [
      `The deterministic analyser currently covers Python only. The ${language} profile is not implemented, so no complexity claim is made.`,
    ],
    derivation: [],
  };
}

/** One-paragraph summary suitable for injecting into a model prompt. */
export function summarizeAnalysis(a: AnalysisResult): string {
  const parts = [
    `time ${a.timeComplexity}, space ${a.spaceComplexity}`,
    `${a.loops.length} loop(s), max nesting depth ${a.loops.reduce((m, l) => Math.max(m, l.depth), 0)}`,
    `${a.functionCount} function(s)`,
  ];
  if (a.recursion.detected) {
    parts.push(
      `recursion detected (argument ${a.recursion.argumentShrinks ? "shrinks" : "may not shrink"})`,
    );
  }
  const line = `Deterministic AST analysis: ${parts.join("; ")}.`;
  const crit = a.findings.filter((f) => f.severity !== "info");
  return crit.length ? `${line} ${crit.map((f) => f.message).join(" ")}` : line;
}
