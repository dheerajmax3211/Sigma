import { test } from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown } from "../src/lib/render/markdown";

/**
 * Fenced code is both a rendering contract and an interaction contract: the
 * block must arrive as real `<pre><code>` markup (not literal ``` inside a
 * paragraph) and it must carry exactly one control of the right kind.
 */

test("a Python fenced block renders as a block and gets a Run control", () => {
  const html = renderMarkdown("```python\nimport numpy as np\nprint(np.arange(3))\n```");
  assert.match(html, /<pre[^>]*><code class="language-python">/);
  assert.match(html, /data-sigma-action="run"/);
  assert.match(html, /aria-label="[^"]*[Rr]un[^"]*"/);
  assert.doesNotMatch(html, /data-sigma-action="copy"/);
  // No fence markers may leak into the rendered prose.
  assert.doesNotMatch(html, /```/);
});

test("an unlabelled block that is obviously Python still gets Run", () => {
  const html = renderMarkdown("```\ndef f(x):\n    return x\n\nprint(f(1))\n```");
  assert.match(html, /data-sigma-action="run"/);
});

test("a non-Python block gets Copy instead of Run", () => {
  const html = renderMarkdown("```bash\necho $HOME\n```");
  assert.match(html, /data-sigma-action="copy"/);
  assert.doesNotMatch(html, /data-sigma-action="run"/);
  assert.match(html, /aria-label="[^"]*[Cc]opy[^"]*"/);
});

test("inline code is rendered as <code> and never gets a control", () => {
  const html = renderMarkdown("Call `print(x)` inline.");
  assert.match(html, /<code>print\(x\)<\/code>/);
  assert.doesNotMatch(html, /data-sigma-action/);
  assert.doesNotMatch(html, /sigma-codeblock/);
});

test("code content is HTML-escaped, not injected", () => {
  const html = renderMarkdown("```python\nprint(1 < 2 and 3 > 2)\n```");
  assert.match(html, /1 &lt; 2 and 3 &gt; 2/);
  assert.doesNotMatch(html, /<code[^>]*>print\(1 < 2/);
});

test("math inside a code block is still not rendered as math", () => {
  const html = renderMarkdown("```bash\necho $HOME and $PATH\n```");
  assert.doesNotMatch(html, /class="katex"/);
  assert.match(html, /\$HOME/);
});

test("prose math still renders next to a block", () => {
  const html = renderMarkdown("Norm $\\|v\\|_2$.\n\n```python\nprint(1)\n```");
  assert.match(html, /class="katex"/);
  assert.match(html, /data-sigma-action="run"/);
});
