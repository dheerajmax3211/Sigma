import { marked } from "marked";
import katex from "katex";
import { annotateSymbols, speakingParts } from "@/lib/math/symbols";
import { speakTex } from "@/lib/math/spoken";

/**
 * Isomorphic markdown + KaTeX renderer.
 *
 * Works on the server (for lesson bodies) and in the browser (for coach
 * responses that arrive after hydration). It is a pure string transform, so
 * there is no DOM dependency and no `dangerouslySetInnerHTML` on a component
 * boundary we control.
 *
 * Math handling: `$$…$$` is display math, `$…$` is inline. Code spans and
 * fenced blocks are protected first so a `$` inside a shell command is not
 * mistaken for math.
 */

const MATH_DISPLAY = /\$\$([\s\S]+?)\$\$/g;

/**
 * Inline math.
 *
 * A single newline is allowed inside `$…$`: the YAML content is written with
 * folded scalars, so an expression that fits on one source line can still be
 * split across two by the author's wrapping. A BLANK line is not allowed,
 * because that would let a stray `$` swallow an entire paragraph.
 */
const MATH_INLINE = /(?<!\\)\$((?:(?!\n\s*\n)[^$])+?)(?<!\\)\$/g;

function protectCode(text: string): { text: string; store: string[] } {
  const store: string[] = [];
  const guarded = text.replace(/(```[\s\S]*?```|`[^`\n]+`)/g, (m) => {
    store.push(m);
    return `\u0000CODE${store.length - 1}\u0000`;
  });
  return { text: guarded, store };
}

function restoreCode(text: string, store: string[]): string {
  return text.replace(/\u0000CODE(\d+)\u0000/g, (_, i) => store[Number(i)]);
}

/**
 * Escape a code body for `pre`/`code` HTML.
 *
 * The bodies below are swapped back in *after* `marked` has run, so they miss
 * marked's own escaping and must be escaped here.
 */
function escapeCodeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Protect code from math while keeping it renderable.
 *
 * `protectCode` above replaces an entire span or fence with a private token.
 * That does keep `$` inside `echo $PATH` out of KaTeX, but it also hides the
 * code from `marked`: fenced blocks arrived at the screen as literal ```
 * lines inside a paragraph, and inline spans kept their backticks. Here the
 * delimiters stay in place and only the body is tokenised, so marked still
 * emits `<pre><code class="language-python">` and `<code>` and the stored
 * body is swapped back afterwards.
 */
function protectCodeForMarkdown(markdown: string): { text: string; store: string[] } {
  const store: string[] = [];
  const stash = (body: string): string => `\u0000CODE${store.push(escapeCodeHtml(body)) - 1}\u0000`;

  // Fenced blocks first: replace the body, keep both fence lines and the info
  // string so marked can still attach `language-*`.
  let text = markdown.replace(
    /^([ \t]*)(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)^\1\2[ \t]*$/gm,
    (_m, indent: string, fence: string, info: string, body: string) =>
      // The body capture ends with the newline that closes its last line;
      // marked re-adds a final newline of its own, so drop exactly one here.
      `${indent}${fence}${info}\n${indent}${stash(body.replace(/\n$/, ""))}\n${indent}${fence}`,
  );

  // Inline spans: tokenise the body, keep the delimiters so marked still
  // produces a `<code>` element.
  text = text.replace(/(`+)([^`\n]+?)\1/g, (_m, ticks: string, body: string) =>
    `${ticks}${stash(body)}${ticks}`,
  );

  return { text, store };
}

function restoreMarkdownCode(html: string, store: string[]): string {
  return html.replace(/\u0000CODE(\d+)\u0000/g, (_, i) => store[Number(i)]);
}


/**
 * Normalise a doubled backslash that is immediately followed by a letter.
 *
 * In KaTeX `\\` is a line break, so `\\sigma` renders as a break followed by the
 * literal text "sigma". That sequence is never meaningful — a line break is
 * always followed by whitespace, `&`, `[`, or nothing — so when a letter
 * follows, the author meant a single command escape. YAML block scalars do not
 * process escapes, so writing `\\sigma` there inserts two characters.
 *
 * This is normalisation of an authoring artifact, not a silent fix-up of
 * content: `a \\ b` (a real line break) is left untouched.
 */
function normaliseEscapes(tex: string): string {
  return tex.replace(/\\\\(?=[A-Za-z])/g, "\\");
}

function renderMath(tex: string, displayMode: boolean): string {
  try {
    const html = katex.renderToString(normaliseEscapes(tex), {
      displayMode,
      throwOnError: false,
      strict: false,
      trust: false,
      output: "html",
    });
    // Attach the pronunciation layer. Without it a beginner can read the shape
    // of ∇ but cannot say it, so the formula never enters working memory.
    const annotated = annotateSymbols(html);

    // For display equations, add a "say it" strip. It is a symbol-by-symbol
    // reading of the source — not a fluent English translation. Generating a
    // fluent sentence would mean inventing wording the formula may not support,
    // and a wrong pronunciation is worse than none.
    if (!displayMode) return annotated;

    // Read the formula aloud. This is generated from the TeX by a conservative
    // reader: when it cannot model a construct it returns null and we show only
    // the symbol chips, because a confident wrong reading is worse than none.
    const spoken = speakTex(tex);
    const sayLine = spoken
      ? `<div class="say-line"><span class="say-label">read it aloud</span><span class="say-text">“${escapeHtmlText(spoken)}”</span></div>`
      : "";

    const parts = speakingParts(tex);
    const chips = parts.length
      ? `<div class="say-strip"><span class="say-label">say it</span>${parts
          .map(
            (p) =>
              `<span class="say-chip"><b>${p.char}</b> ${p.name} <span class="say-as">“${p.say}”</span></span>`,
          )
          .join("")}</div>`
      : "";

    return `${annotated}${sayLine}${chips}`;
  } catch {
    // Never let a malformed formula take down a whole page.
    const escaped = tex
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return displayMode
      ? `<div class="katex-error">${escaped}</div>`
      : `<span class="katex-error">${escaped}</span>`;
  }
}

/**
 * Convert math delimiters into rendered KaTeX, leaving code untouched.
 */
export function renderMathIn(text: string): string {
  const { text: guarded, store } = protectCode(text);

  let out = guarded.replace(MATH_DISPLAY, (_m, tex: string) => renderMath(tex, true));

  // Inline math must not swallow the `$$` that display math already consumed.
  out = out.replace(MATH_INLINE, (_m, tex: string) => renderMath(tex, false));

  // Emphasis. Authors write `**text**` in concept_points, definitions and
  // checkpoints, which are rendered through here rather than through full
  // markdown — so without this the asterisks reached the screen literally
  // (57 occurrences in one topic). Bold only: a single `*` is too easily a
  // multiplication sign in prose. Math is already HTML at this point, so no
  // delimiter can be inside a formula.
  out = out.replace(/\*\*(.+?)\*\*/g, (_m, inner: string) =>
    `<strong>${inner.replace(/\*([^*\n]+)\*/g, "<em>$1</em>")}</strong>`,
  );

  return restoreCode(out, store);
}

/**
 * One-click controls on fenced code blocks.
 *
 * The lesson body is rendered to HTML on the server, so the control has to be
 * part of that string: a client-side DOM pass would either run after paint or
 * fight React over nodes it owns. The markup is inert — `CodeEditor.tsx`
 * installs a single delegated listener that reads the snippet out of the
 * sibling `<code>` element — so nothing here depends on hydration ordering.
 *
 * Wrapping the `<pre>` in a relative container is what lets the control sit on
 * the block without disturbing `.prose-i0 pre` itself; the only inline style
 * the block gains is right padding, so the code does not run under the chip.
 */
const RUN_BUTTON_CLASS =
  "rounded-md border border-brand/40 text-brand text-[10.5px] px-2 py-0.5 bg-surface-2 font-mono leading-[1.7] cursor-pointer transition hover:bg-surface-3";
const COPY_BUTTON_CLASS =
  "rounded-md border border-line text-ink-dim text-[10.5px] px-2 py-0.5 bg-surface-2 font-mono leading-[1.7] cursor-pointer transition hover:bg-surface-3";

const CODE_BLOCK_HTML = /<pre><code(?:\s+class="language-([^"\s]+)")?>([\s\S]*?)<\/code><\/pre>/g;

const PYTHON_LANGS = new Set(["python", "py", "python3"]);
const PYTHON_HINTS = ["import numpy", "def ", "print(", "assert ", "np."];

function looksLikePython(language: string | undefined, body: string): boolean {
  if (language) return PYTHON_LANGS.has(language);
  return PYTHON_HINTS.some((hint) => body.includes(hint));
}

function actionControl(kind: "run" | "copy"): string {
  const style = "position:absolute;top:8px;right:8px;z-index:2";
  if (kind === "run") {
    return (
      `<button type="button" data-sigma-action="run"` +
      ` aria-label="Run this Python example in the code playground"` +
      ` title="Run this snippet in the code playground"` +
      ` style="${style}" class="${RUN_BUTTON_CLASS}">▶ Run</button>`
    );
  }
  return (
    `<button type="button" data-sigma-action="copy"` +
    ` aria-label="Copy this code block to the clipboard"` +
    ` title="Copy this code block"` +
    ` style="${style}" class="${COPY_BUTTON_CLASS}">copy</button>`
  );
}

/**
 * Add a Run (Python) or Copy (anything else) control to every fenced block.
 *
 * Called on the final HTML so it also covers blocks produced for content that
 * is rendered on the server, and it only ever matches `pre > code` — an inline
 * `<code>` span has no `<pre>` around it and is left alone.
 */
export function addCodeBlockActions(html: string): string {
  return html.replace(CODE_BLOCK_HTML, (_m, language: string | undefined, body: string) => {
    const python = looksLikePython(language?.toLowerCase(), body);
    const button = actionControl(python ? "run" : "copy");
    const classAttr = language ? ` class="language-${language}"` : "";
    return (
      `<div class="sigma-codeblock" data-sigma-codeblock="${python ? "python" : "copy"}" style="position:relative">` +
      button +
      `<pre style="padding-right:5.5rem"><code${classAttr}>${body}</code></pre>` +
      `</div>`
    );
  });
}

/**
 * Full markdown → HTML, with math rendered.
 */
export function renderMarkdown(markdown: string): string {
  const { text: guarded, store } = protectCodeForMarkdown(markdown);


  // Render display math first and stash the HTML, so `marked` cannot mangle it.
  const displayStore: string[] = [];
  let staged = guarded.replace(MATH_DISPLAY, (_m, tex: string) => {
    const html = renderMath(tex, true);
    displayStore.push(html);
    return `\u0000DISPLAY${displayStore.length - 1}\u0000`;
  });

  // Inline math: protect from marked's emphasis handling by using a token.
  const inlineStore: string[] = [];
  staged = staged.replace(MATH_INLINE, (_m, tex: string) => {
    const html = renderMath(tex, false);
    inlineStore.push(html);
    return `\u0000INLINE${inlineStore.length - 1}\u0000`;
  });

  let html = marked.parse(staged, { async: false, gfm: true, breaks: false }) as string;

  html = html.replace(/\u0000DISPLAY(\d+)\u0000/g, (_, i) => displayStore[Number(i)]);
  html = html.replace(/\u0000INLINE(\d+)\u0000/g, (_, i) => inlineStore[Number(i)]);

  // Code comes back escaped, then gets its one-click control.
  const out = addCodeBlockActions(restoreMarkdownCode(html, store));

  // If the author already wrote a spoken reading beside the formulas, the
  // generated one is noise. Authored beats generated; the generated line exists
  // only for the far larger body of content that has no hand-written reading.
  if (/say it aloud/i.test(markdown)) {
    return out.replace(/<div class="say-line">[\s\S]*?<\/div>/g, "");
  }
  return out;
}

/** Strip markdown down to plain text — used for prompt budgets and excerpts. */
export function toPlainText(markdown: string, maxLength = 4000): string {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/\$\$([\s\S]+?)\$\$/g, "$1")
    .replace(/\$([^$\n]+?)\$/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_>]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

/** Pull the math out of a markdown body, for the "math only" reading view. */
export function extractMath(markdown: string): string[] {
  const out: string[] = [];
  const re = /\$\$([\s\S]+?)\$\$|(?<!\\)\$([^$\n]+?)(?<!\\)\$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown))) out.push((m[1] ?? m[2]).trim());
  return out;
}

/** Minimal HTML escaping for generated spoken text. */
function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
