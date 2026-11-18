/**
 * The symbol layer.
 *
 * A learner who cannot *pronounce* a symbol cannot rehearse a formula in their
 * head — the phonological loop is how equations get held in working memory. An
 * oral interview then exposes the gap: you freeze on "walk me through the
 * gradient" because ∇ never had a name.
 *
 * So every symbol carries three things: its name, how to say it, and what it
 * means in ML. The tooltip is attached by post-processing KaTeX output, and the
 * same dictionary powers the floating glossary drawer.
 */

export interface SymbolEntry {
  /** The glyph as it appears in rendered text. */
  char: string;
  /** LaTeX source, for the glossary. */
  tex: string;
  name: string;
  /** How to say it, written phonetically. */
  say: string;
  meaning: string;
  group: "Greek" | "Operators" | "Notation";
}

export const SYMBOLS: SymbolEntry[] = [
  { char: "α", tex: "\\alpha", name: "alpha", say: "AL-fuh", meaning: "learning rate, or a mixing weight", group: "Greek" },
  { char: "β", tex: "\\beta", name: "beta", say: "BAY-tuh", meaning: "momentum decay (Adam's β₁, β₂), or a temperature parameter", group: "Greek" },
  { char: "γ", tex: "\\gamma", name: "gamma", say: "GAM-uh", meaning: "discount factor, or a scaling constant", group: "Greek" },
  { char: "δ", tex: "\\delta", name: "delta", say: "DEL-tuh", meaning: "a small change, or the error signal in backprop", group: "Greek" },
  { char: "ε", tex: "\\epsilon", name: "epsilon", say: "EP-sih-lon", meaning: "a small constant for numerical stability (Adam's ε)", group: "Greek" },
  { char: "η", tex: "\\eta", name: "eta", say: "AY-tuh", meaning: "learning rate", group: "Greek" },
  { char: "θ", tex: "\\theta", name: "theta", say: "THAY-tuh", meaning: "model parameters — the numbers training changes", group: "Greek" },
  { char: "κ", tex: "\\kappa", name: "kappa", say: "KAP-uh", meaning: "condition number, or a concentration parameter", group: "Greek" },
  { char: "λ", tex: "\\lambda", name: "lambda", say: "LAM-duh", meaning: "regularisation strength, or an eigenvalue", group: "Greek" },
  { char: "μ", tex: "\\mu", name: "mu", say: "MYOO", meaning: "a mean, or momentum coefficient", group: "Greek" },
  { char: "ν", tex: "\\nu", name: "nu", say: "NOO", meaning: "degrees of freedom, or a frequency", group: "Greek" },
  { char: "π", tex: "\\pi", name: "pi", say: "PIE", meaning: "a policy in RL, or the constant 3.14159", group: "Greek" },
  { char: "ρ", tex: "\\rho", name: "rho", say: "ROH", meaning: "a correlation, or a decay rate", group: "Greek" },
  { char: "σ", tex: "\\sigma", name: "sigma (lowercase)", say: "SIG-muh", meaning: "standard deviation, or the sigmoid function", group: "Greek" },
  { char: "Σ", tex: "\\Sigma", name: "sigma (capital)", say: "SIG-muh", meaning: "a sum over a range, or a covariance matrix", group: "Greek" },
  { char: "τ", tex: "\\tau", name: "tau", say: "TAU (rhymes with cow)", meaning: "a temperature, or a soft-update rate", group: "Greek" },
  { char: "φ", tex: "\\phi", name: "phi", say: "FY", meaning: "a feature map, or a phase", group: "Greek" },
  { char: "χ", tex: "\\chi", name: "chi", say: "KY", meaning: "the chi-squared statistic", group: "Greek" },
  { char: "ψ", tex: "\\psi", name: "psi", say: "SY", meaning: "a hidden state, or a wavefunction", group: "Greek" },
  { char: "ω", tex: "\\omega", name: "omega", say: "oh-MAY-guh", meaning: "weights in AdamW's decoupled decay", group: "Greek" },
  { char: "∂", tex: "\\partial", name: "partial", say: "PAR-shul", meaning: "a partial derivative — slope holding the other variables fixed", group: "Operators" },
  { char: "∇", tex: "\\nabla", name: "nabla", say: "DEL or NAB-luh", meaning: "the gradient — the vector pointing uphill", group: "Operators" },
  { char: "∑", tex: "\\sum", name: "summation", say: "SUM", meaning: "add up the terms over the stated range", group: "Operators" },
  { char: "∏", tex: "\\prod", name: "product", say: "PROD-uct", meaning: "multiply the terms over the stated range", group: "Operators" },
  { char: "∫", tex: "\\int", name: "integral", say: "IN-tuh-grul", meaning: "accumulate continuously — the limit of a sum", group: "Operators" },
  { char: "⊙", tex: "\\odot", name: "Hadamard product", say: "huh-DAM-ard", meaning: "element-wise multiplication of equal-shaped tensors", group: "Operators" },
  { char: "⊗", tex: "\\otimes", name: "tensor product", say: "TEN-ser prod-uct", meaning: "outer / Kronecker product, or a tensor contraction", group: "Operators" },
  { char: "√", tex: "\\sqrt{}", name: "square root", say: "square root", meaning: "the value that squares to the argument — see √d_k in attention", group: "Operators" },
  { char: "≈", tex: "\\approx", name: "approximately equal", say: "ap-prox-ih-mut-lee", meaning: "equal to within a stated tolerance", group: "Notation" },
  { char: "≠", tex: "\\neq", name: "not equal", say: "not equal", meaning: "the two sides differ", group: "Notation" },
  { char: "∈", tex: "\\in", name: "element of", say: "in", meaning: "belongs to the set that follows", group: "Notation" },
  { char: "ℝ", tex: "\\mathbb{R}", name: "the reals", say: "R", meaning: "real numbers; ℝ^d is d-dimensional real space", group: "Notation" },
  { char: "𝔼", tex: "\\mathbb{E}", name: "expectation", say: "expected value of", meaning: "the probability-weighted long-run average", group: "Notation" },
  { char: "ℒ", tex: "\\mathcal{L}", name: "loss", say: "loss", meaning: "the objective being minimised", group: "Notation" },
  { char: "𝒩", tex: "\\mathcal{N}", name: "normal distribution", say: "normal", meaning: "Gaussian; 𝒩(μ, Σ) is mean μ, covariance Σ", group: "Notation" },
  // Added after a learner pointed at ‖A − A_k‖_F = √(Σ_{i>k} σᵢ²) and said,
  // truthfully, that they could not read it aloud. The norm bars and the
  // inequalities were the two biggest holes.
  { char: "‖", tex: "\\lVert", name: "norm bars", say: "the norm of", meaning: "‖x‖ is the length of a vector; ‖A‖_F is the Frobenius norm, the square root of the sum of squared entries", group: "Operators" },
  { char: "≥", tex: "\\geq", name: "greater than or equal", say: "greater than or equal to", meaning: "i ≥ k means index i is at or past k", group: "Operators" },
  { char: "≤", tex: "\\leq", name: "less than or equal", say: "less than or equal to", meaning: "t ≤ T means the step is at or before the horizon", group: "Operators" },
  { char: "±", tex: "\\pm", name: "plus or minus", say: "plus or minus", meaning: "an interval of uncertainty, as in μ ± σ", group: "Operators" },
  { char: "∝", tex: "\\propto", name: "proportional to", say: "is proportional to", meaning: "scales linearly with; constants dropped", group: "Operators" },
  { char: "⊤", tex: "\\top", name: "transpose", say: "transpose", meaning: "A⊤ is A with rows and columns swapped", group: "Operators" },
  { char: "∞", tex: "\\infty", name: "infinity", say: "infinity", meaning: "unbounded, or the limit as a quantity grows without limit", group: "Operators" },
  { char: "→", tex: "\\to", name: "arrow", say: "goes to, or maps to", meaning: "a limit, or a function's output type", group: "Operators" },
  { char: "⇒", tex: "\\Rightarrow", name: "implies", say: "implies", meaning: "if the left holds, the right follows", group: "Operators" },
  { char: "·", tex: "\\cdot", name: "dot", say: "times, or dot", meaning: "multiplication, or a dot product", group: "Operators" },
  { char: "×", tex: "\\times", name: "times", say: "times", meaning: "scalar multiplication or a tensor product", group: "Operators" },
  { char: "Ω", tex: "\\Omega", name: "Omega", say: "oh-MAY-guh", meaning: "a big-O-style cost bound, or a sample space", group: "Greek" },
];

const BY_CHAR = new Map(SYMBOLS.map((s) => [s.char, s]));

/** Escape for safe insertion into an HTML attribute. */
function attr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Wrap known symbols in the *text* portions of an HTML string.
 *
 * Splitting on tags first is what keeps this safe: a naive global replace would
 * also hit `class` and `style` attributes and corrupt the markup.
 */
export function annotateSymbols(html: string): string {
  return html
    .split(/(<[^>]*>)/)
    .map((part, i) => {
      if (i % 2 === 1) return part; // a tag — leave untouched
      let out = "";
      for (const ch of part) {
        const entry = BY_CHAR.get(ch);
        if (!entry) {
          out += ch;
          continue;
        }
        const tip = `${entry.name} — say “${entry.say}” — ${entry.meaning}`;
        out += `<span class="sym-tip" data-tip="${attr(tip)}" tabindex="0">${ch}</span>`;
      }
      return out;
    })
    .join("");
}

/** Grouped for the glossary drawer. */
export function symbolsByGroup(): { group: string; entries: SymbolEntry[] }[] {
  const order = ["Greek", "Operators", "Notation"] as const;
  return order.map((group) => ({
    group,
    entries: SYMBOLS.filter((s) => s.group === group),
  }));
}

/**
 * The symbols that actually appear in a TeX expression, in order of first
 * appearance, for the "say it" strip under display equations.
 *
 * Deterministic: it reports the symbols the formula contains, not a guess at
 * what the formula means.
 */
export function speakingParts(tex: string): SymbolEntry[] {
  const seen = new Set<string>();
  const out: SymbolEntry[] = [];
  for (const entry of SYMBOLS) {
    const probe = entry.tex.replace(/\{\}$/, "");
    const present =
      tex.includes(entry.char) ||
      (probe.length > 1 && new RegExp(probe.replace(/\\/g, "\\\\") + "(?![a-zA-Z])").test(tex));
    if (present && !seen.has(entry.tex)) {
      seen.add(entry.tex);
      out.push(entry);
    }
  }
  return out.slice(0, 10);
}
