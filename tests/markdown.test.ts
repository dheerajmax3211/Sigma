import { test } from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown, renderMathIn, toPlainText, extractMath } from "../src/lib/render/markdown";

test("inline math is rendered", () => {
  const html = renderMarkdown("The norm is $\\|v\\|_2 = \\sqrt{v \\cdot v}$ exactly.");
  assert.match(html, /class="katex"/);
  assert.doesNotMatch(html, /\$/);
});

test("display math is rendered", () => {
  const html = renderMarkdown("$$\\frac{a}{b}$$");
  assert.match(html, /katex-display/);
});

test("inline math spanning a single newline is rendered", () => {
  // This is the shape the YAML content produces: a folded scalar keeps the
  // author's line break inside the expression.
  const html = renderMarkdown("The infinity norm $|v|_\\infty =\n\\max_i |v_i|$ is different.");
  assert.match(html, /class="katex"/);
  assert.doesNotMatch(html, /\$/);
});

test("inline math does not swallow a blank-line paragraph break", () => {
  const html = renderMarkdown("A stray $ sign.\n\nAnother $ paragraph here.");
  // The stray $ must not cause the next paragraph to be eaten.
  assert.match(html, /Another/);
});

test("dollars inside code spans are not treated as math", () => {
  const html = renderMarkdown("Run `echo $PATH` to print the path.");
  assert.doesNotMatch(html, /class="katex"/);
  assert.match(html, /echo \$PATH/);
});

test("dollars inside fenced code blocks are not treated as math", () => {
  const html = renderMarkdown("```bash\necho $HOME\n```");
  assert.doesNotMatch(html, /class="katex"/);
});

test("markdown tables are rendered", () => {
  const html = renderMarkdown("| a | b |\n|---|---|\n| 1 | 2 |");
  assert.match(html, /<table>/);
  assert.match(html, /<th[^>]*>a<\/th>/);
});

test("malformed latex degrades instead of throwing", () => {
  const html = renderMarkdown("$\\frac{unclosed$");
  assert.ok(html.length > 0);
});

test("toPlainText strips markup and keeps math content", () => {
  const text = toPlainText("# Heading\n\nSome $x^2$ math.\n\n```\ncode\n```");
  assert.ok(!text.includes("#"));
  assert.ok(!text.includes("code"));
  assert.ok(text.includes("x^2"));
});

test("extractMath finds both inline and display expressions", () => {
  const found = extractMath("Inline $a+b$ and display $$\\frac{c}{d}$$");
  assert.equal(found.length, 2);
});

test("renderMathIn leaves code alone", () => {
  const out = renderMathIn("`$x$` and $y$");
  assert.match(out, /class="katex"/);
});

test("a doubled backslash before a letter is normalised, not rendered as a break", () => {
  // YAML block scalars do not process escapes, so `\\sigma` arrives doubled.
  // KaTeX would read `\\` as a line break and typeset the word "sigma".
  const out = renderMathIn("$\\sigma_i^2$");
  assert.match(out, /class="katex"/);
  // The Greek letter must be present, and the literal text "sigma" absent.
  assert.match(out, /\u03c3/);
  assert.doesNotMatch(out, />sigma</);
});

test("a real line break in a matrix is left alone", () => {
  // `\\` followed by whitespace is a genuine row separator and must survive.
  const out = renderMathIn("$\\begin{matrix} a \\\\ b \\end{matrix}$");
  assert.match(out, /class="katex"/);
});

test("bold in an InlineMath field renders as <strong>, not literal asterisks", () => {
  // concept_points / definitions / checkpoints go through renderMathIn, not
  // through full markdown, so ** was reaching the screen literally.
  const out = renderMathIn("**204.8** per batch at $x^2$");
  assert.match(out, /<strong>204\.8<\/strong>/);
  assert.doesNotMatch(out, /\*\*204\.8\*\*/);
});

test("a single asterisk is left alone (it is usually multiplication)", () => {
  const out = renderMathIn("3 * 4 = 12");
  assert.match(out, /3 \* 4 = 12/);
});

test("bold containing an italic span still renders (nested emphasis)", () => {
  const out = renderMathIn("**The gain from *Decision Trees*, swapped.**");
  assert.match(out, /<strong>/);
  assert.match(out, /<em>Decision Trees<\/em>/);
  assert.doesNotMatch(out, /\*\*/);
});
