"use client";

import { useEffect, useMemo, useState } from "react";
import Editor from "@monaco-editor/react";
import { renderMarkdown, renderMathIn } from "@/lib/render/markdown";

/** Where the prose hands a snippet to the playground. */
export const LESSON_SNIPPET_KEY = "sigma.snippet";

export interface SnippetRecord {
  code: string;
  at: number;
}

/** The code body that belongs to the block a control lives in. */
function codeForControl(element: Element): string {
  const block = element.closest("[data-sigma-codeblock]");
  const code = block?.querySelector("code");
  // `textContent` is the decoded source, so `&lt;` in the HTML is already `<`
  // here. The trailing newline marked emits inside a fenced block is not part
  // of what the learner wrote.
  return code?.textContent?.replace(/\n$/, "") ?? "";
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission denied or an insecure context — fall back to the selection
    // trick rather than leaving the learner with a button that does nothing.
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

/** Briefly swap a control's label so the copy gives feedback. */
function flashLabel(button: HTMLElement, label: string): void {
  if (button.dataset.sigmaBusy === "1") return;
  const original = button.textContent ?? "";
  button.dataset.sigmaBusy = "1";
  button.textContent = label;
  window.setTimeout(() => {
    button.textContent = original;
    delete button.dataset.sigmaBusy;
  }, 1400);
}

function handleCodeControlClick(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest<HTMLElement>("[data-sigma-action]");
  if (!button) return;

  const code = codeForControl(button);
  if (!code) return;

  if (button.dataset.sigmaAction === "run") {
    event.preventDefault();
    // Hand the snippet over, then let the lab read it on mount. A synchronous
    // write means navigation cannot race the storage.
    try {
      const record: SnippetRecord = { code, at: Date.now() };
      window.localStorage.setItem(LESSON_SNIPPET_KEY, JSON.stringify(record));
    } catch {
      // Private mode or a full quota: still open the lab. The snippet is the
      // only casualty, and that is already a degraded browser.
    }
    window.location.assign("/lab");
    return;
  }

  if (button.dataset.sigmaAction === "copy") {
    event.preventDefault();
    void copyText(code).then((ok) => flashLabel(button, ok ? "copied" : "copy failed"));
  }
}

let codeControlsInstalled = false;

/**
 * Attach the one delegated listener for every code-block control.
 *
 * The controls themselves are part of the markdown HTML, rendered on the
 * server for lesson bodies, so there is no per-button React handler to bind;
 * one delegated listener on the document covers prose that hydrates later,
 * coach responses, and anything else that renders a fenced block. Safe to call
 * more than once.
 */
export function installCodeBlockActions(): void {
  if (codeControlsInstalled || typeof document === "undefined") return;
  codeControlsInstalled = true;
  document.addEventListener("click", handleCodeControlClick);
}

// Client modules are evaluated on the server too during SSR; only install in
// the browser. This is what makes the server-rendered buttons live on a topic
// page whose prose never passes through the `Markdown` component.
if (typeof window !== "undefined") installCodeBlockActions();


/**
 * Monaco editor configured for this platform.
 *
 * The theme is hand-written rather than `vs-dark` so the editor matches the
 * app's own surface tokens exactly — the same trick the reference app used to make its
 * editor feel native rather than embedded.
 */
function defineTheme(monaco: typeof import("monaco-editor")) {
  monaco.editor.defineTheme("sigma", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "626c7a", fontStyle: "italic" },
      { token: "keyword", foreground: "f472b6" },
      { token: "string", foreground: "1cd6ac" },
      { token: "number", foreground: "fbbf24" },
      { token: "type", foreground: "38bdf8" },
      { token: "function", foreground: "a78bfa" },
      { token: "operator", foreground: "9aa4b2" },
    ],
    colors: {
      "editor.background": "#0b0e13",
      "editor.foreground": "#d7dbe0",
      "editorLineNumber.foreground": "#3d4553",
      "editorLineNumber.activeForeground": "#9aa4b2",
      "editor.selectionBackground": "#1cd6ac2a",
      "editor.lineHighlightBackground": "#ffffff06",
      "editorCursor.foreground": "#1cd6ac",
      "editorIndentGuide.background1": "#ffffff10",
      "editorWidget.background": "#10141b",
      "editorWidget.border": "#ffffff26",
      "editorSuggestWidget.background": "#10141b",
      "editorSuggestWidget.border": "#ffffff26",
      "editorSuggestWidget.selectedBackground": "#1cd6ac1f",
      "scrollbarSlider.background": "#ffffff1a",
      "scrollbarSlider.hoverBackground": "#ffffff2e",
    },
  });
}

export function CodeEditor({
  value,
  onChange,
  language = "python",
  height = "380px",
  onMount,
}: {
  value: string;
  onChange?: (next: string) => void;
  language?: string;
  height?: string;
  /** Fired once Monaco is ready — used to take focus back from the editor. */
  onMount?: () => void;
}) {
  return (
    <div
      className="overflow-hidden rounded-xl border border-line bg-surface-1"
      style={{ height }}
      data-hermes-send=""
    >
      <Editor
        height={height}
        language={language}
        value={value}
        theme="sigma"
        onChange={(next) => onChange?.(next ?? "")}
        beforeMount={defineTheme}
        onMount={() => onMount?.()}
        loading={<div className="p-4 font-mono text-[12px] text-ink-dimmer">loading editor…</div>}
        options={{
          fontSize: 13,
          fontFamily: '"Share Tech Mono", ui-monospace, monospace',
          fontLigatures: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          padding: { top: 12, bottom: 12 },
          renderLineHighlight: "line",
          smoothScrolling: true,
          tabSize: 4,
          wordWrap: "on",
          automaticLayout: true,
        }}
      />
    </div>
  );
}

/** Render markdown + KaTeX into a sanitised HTML block. */
export function Markdown({ source, className = "" }: { source: string; className?: string }) {
  const html = useMemo(() => renderMarkdown(source), [source]);
  // The controls live in the HTML above; make sure the delegated listener is
  // present even if this module was imported for `InlineMath` alone.
  useEffect(() => {
    installCodeBlockActions();
  }, []);
  return (
    <div
      className={`prose-i0 ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/**
 * Render `$…$` math inside a block of plain text.
 *
 * Used for short fields — visualizer descriptions, checkpoint questions,
 * problem prompts — where a full markdown block would be wrong (it would
 * introduce paragraph tags inside an existing paragraph) but the text may
 * still contain an inline expression.
 */
export function InlineMath({ source, className = "" }: { source: string; className?: string }) {
  const html = useMemo(() => renderMathIn(source), [source]);
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
