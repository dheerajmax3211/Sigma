import { NextResponse } from "next/server";
import { detectSystem, type SystemSpecs } from "@/lib/system/detector";
import { recommend, type Recommendation } from "@/lib/system/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Local machine report.
 *
 * The Ollama probe is best-effort: a daemon that is not installed or not
 * running is the *normal* first-run state, not an error. This route therefore
 * always answers 200 with `ollama.reachable: false` rather than surfacing a
 * network failure the UI would have to special-case.
 */

const OLLAMA_BASE = "http://127.0.0.1:11434";
const PROBE_TIMEOUT_MS = 1200;

export interface OllamaStatus {
  reachable: boolean;
  version: string | null;
  models: string[];
  /** Present only when the probe failed; safe to show to a human. */
  error?: string;
}

function describeError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return `No response from ${OLLAMA_BASE} within ${PROBE_TIMEOUT_MS} ms.`;
    }
    const cause = (err as { cause?: { code?: unknown } }).cause;
    const code = typeof cause?.code === "string" ? cause.code : null;
    if (code === "ECONNREFUSED") {
      return `Nothing is listening on ${OLLAMA_BASE} (connection refused).`;
    }
    return code ? `${err.message} (${code})` : err.message;
  }
  return "Unknown error probing the local daemon.";
}

async function probeOllama(): Promise<OllamaStatus> {
  let version: string | null = null;

  try {
    const res = await fetch(`${OLLAMA_BASE}/api/version`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) {
      return {
        reachable: false,
        version: null,
        models: [],
        error: `Ollama answered HTTP ${res.status} on /api/version.`,
      };
    }
    const data = (await res.json()) as { version?: unknown };
    version = typeof data?.version === "string" ? data.version : null;
  } catch (err) {
    return { reachable: false, version: null, models: [], error: describeError(err) };
  }

  // Reachable but the tag list failed: report reachable with an empty list
  // rather than pretending no models are installed.
  let models: string[] = [];
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      cache: "no-store",
    });
    if (res.ok) {
      const data = (await res.json()) as { models?: unknown };
      if (Array.isArray(data?.models)) {
        models = data.models
          .map((m) => (m as { name?: unknown })?.name)
          .filter((n): n is string => typeof n === "string" && n.length > 0);
      }
    }
  } catch {
    // Leave models empty; reachable is still true.
  }

  return { reachable: true, version, models };
}

export async function GET() {
  let specs: SystemSpecs;
  let recommendation: Recommendation;

  try {
    specs = detectSystem();
    recommendation = recommend(specs);
  } catch (err) {
    return NextResponse.json(
      { error: "Could not read this machine's specifications.", detail: describeError(err) },
      { status: 500 },
    );
  }

  const ollama = await probeOllama();

  return NextResponse.json({ specs, recommendation, ollama });
}
