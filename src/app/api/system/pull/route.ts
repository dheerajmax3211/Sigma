import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Streaming model pull.
 *
 * Ollama's /api/pull emits newline-delimited JSON progress events. Rather than
 * buffering them server-side (a 22 GB download would hold the whole progress
 * log in memory) the upstream body is piped straight through to the browser,
 * which reads it with a stream reader.
 *
 * The only translated failure is "daemon not running", because that is the one
 * the UI can actually help with: it hands back the install command.
 */

const OLLAMA_BASE = "http://127.0.0.1:11434";
const INSTALL_COMMAND = "brew install ollama && ollama serve";

/** Ollama tags: letters, digits, dots, dashes, underscores, one slash, one colon. */
const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}(?:\/[A-Za-z0-9][A-Za-z0-9._-]{0,63})?(?::[A-Za-z0-9._-]{1,32})?$/;

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const raw = (body as { model?: unknown } | null)?.model;
  const model = typeof raw === "string" ? raw.trim() : "";
  if (!model) {
    return NextResponse.json({ error: "A `model` tag is required." }, { status: 400 });
  }
  if (!MODEL_PATTERN.test(model)) {
    return NextResponse.json({ error: `"${model}" is not a valid Ollama model tag.` }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${OLLAMA_BASE}/api/pull`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: model, stream: true }),
      // Cancelling the browser request cancels the pull, so an abandoned
      // panel does not keep downloading gigabytes in the background.
      signal: req.signal,
    });
  } catch (err) {
    const aborted = req.signal.aborted;
    if (aborted) {
      return new Response(null, { status: 499 });
    }
    return NextResponse.json(
      {
        error:
          "Ollama is not reachable on 127.0.0.1:11434. Install it and start the daemon, then try again.",
        command: INSTALL_COMMAND,
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 503 },
    );
  }

  if (!upstream.ok || !upstream.body) {
    let detail = `Ollama answered HTTP ${upstream.status}.`;
    try {
      const text = await upstream.text();
      if (text.trim()) detail = text.trim().slice(0, 500);
    } catch {
      // Keep the status line as the message.
    }
    return NextResponse.json({ error: detail, command: INSTALL_COMMAND }, { status: 502 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
