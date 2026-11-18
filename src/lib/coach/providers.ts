import { z } from "zod";

/**
 * Provider abstraction.
 *
 * The reference app hard-coded four providers into its API routes. Here every provider
 * implements one interface, and the provider list is data — so adding a local
 * model or a self-hosted gateway is a config change, not a code change.
 *
 * Gemini is reached through its OpenAI-compatible endpoint (as the reference app also
 * does), which means one wire format covers both.
 */

export const PROVIDER_IDS = ["anthropic", "openai", "gemini", "ollama", "local"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export const ChatMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface ChatResponse {
  text: string;
  model: string;
  provider: ProviderId;
  usage?: { inputTokens?: number; outputTokens?: number };
  /** Present when the provider failed in a way the UI should surface. */
  error?: { kind: ProviderErrorKind; message: string };
}

export const PROVIDER_ERROR_KINDS = [
  "invalid_key",
  "network",
  "rate_limited",
  "not_found",
  "server_error",
  "unsupported",
] as const;
export type ProviderErrorKind = (typeof PROVIDER_ERROR_KINDS)[number];

export interface Provider {
  readonly id: ProviderId;
  readonly label: string;
  /** True when the provider needs no credential (local models, offline tutor). */
  readonly requiresKey: boolean;
  readonly defaultModel: string;
  readonly models: readonly string[];
  chat(req: ChatRequest, apiKey?: string): Promise<ChatResponse>;
}

/**
 * Classify an HTTP failure into the same taxonomy the reference app used, because that
 * taxonomy is genuinely good: "your key is wrong", "you are offline" and
 * "the provider is throttling you" need three different user actions.
 */
export function classifyHttpError(status: number, body: string): {
  kind: ProviderErrorKind;
  message: string;
} {
  const lower = body.toLowerCase();
  if (status === 401 || status === 403) {
    if (lower.includes("api key") || lower.includes("api_key") || lower.includes("unauthorized")) {
      return { kind: "invalid_key", message: "Your API key looks invalid — check it in Settings." };
    }
    return { kind: "invalid_key", message: "The provider rejected this credential (HTTP " + status + ")." };
  }
  if (status === 429) {
    return { kind: "rate_limited", message: "Rate-limited by the provider — wait a moment and try again." };
  }
  if (status === 404) {
    return { kind: "not_found", message: "That model or endpoint was not found." };
  }
  if (status >= 500) {
    return { kind: "server_error", message: "The provider returned a server error (HTTP " + status + ")." };
  }
  return { kind: "server_error", message: "Unexpected provider response (HTTP " + status + ")." };
}

export function classifyNetworkError(err: unknown): {
  kind: ProviderErrorKind;
  message: string;
} {
  const name = (err as { name?: string })?.name ?? "";
  const msg = (err as { message?: string })?.message ?? String(err);
  if (name === "AbortError") {
    return { kind: "network", message: "The request was cancelled." };
  }
  if (/timeout/i.test(msg)) {
    return { kind: "network", message: "The provider timed out — try again." };
  }
  return { kind: "network", message: "Could not reach the provider — check your internet connection." };
}

// ── Wire helpers ─────────────────────────────────────────────────────────────

interface OpenAiLikeResponse {
  choices?: { message?: { content?: string }; text?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

async function readBody(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

export const OpenAICompatibleProvider = (
  opts: {
    id: ProviderId;
    label: string;
    baseUrl: string;
    defaultModel: string;
    models: readonly string[];
    requiresKey: boolean;
    /** Anthropic uses a different message shape; everything else is OpenAI-like. */
    wire?: "openai" | "anthropic";
    extraHeaders?: Record<string, string>;
    defaultHeaders?: Record<string, string>;
  },
): Provider => ({
  id: opts.id,
  label: opts.label,
  requiresKey: opts.requiresKey,
  defaultModel: opts.defaultModel,
  models: opts.models,
  async chat(req: ChatRequest, apiKey?: string): Promise<ChatResponse> {
    const model = req.model ?? opts.defaultModel;
    const system = req.messages.filter((m) => m.role === "system").map((m) => m.content);
    const rest = req.messages.filter((m) => m.role !== "system");

    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...(opts.defaultHeaders ?? {}),
      ...(opts.extraHeaders ?? {}),
    };
    if (opts.requiresKey && apiKey) headers["x-api-key"] = apiKey;

    let url = opts.baseUrl;
    let body: unknown;

    if (opts.wire === "anthropic") {
      url = opts.baseUrl;
      headers["anthropic-version"] = "2023-06-01";
      body = {
        model,
        max_tokens: req.maxTokens ?? 2048,
        ...(req.temperature != null ? { temperature: req.temperature } : {}),
        system: system.join("\n\n"),
        messages: rest.map((m) => ({ role: m.role, content: m.content })),
      };
    } else {
      body = {
        model,
        max_tokens: req.maxTokens ?? 2048,
        ...(req.temperature != null ? { temperature: req.temperature } : {}),
        messages: [
          ...(system.length ? [{ role: "system", content: system.join("\n\n") }] : []),
          ...rest.map((m) => ({ role: m.role, content: m.content })),
        ],
      };
    }

    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: req.signal,
      });

      if (!res.ok) {
        const text = await readBody(res);
        const { kind, message } = classifyHttpError(res.status, text);
        return { text: "", model, provider: opts.id, error: { kind, message } };
      }

      const data = (await res.json()) as OpenAiLikeResponse & {
        content?: { type: string; text?: string }[];
      };

      let text = "";
      if (opts.wire === "anthropic" && Array.isArray(data.content)) {
        text = data.content.map((c) => c.text ?? "").join("");
      } else if (data.choices?.[0]) {
        text = data.choices[0].message?.content ?? data.choices[0].text ?? "";
      }

      return {
        text,
        model,
        provider: opts.id,
        usage: {
          inputTokens: data.usage?.prompt_tokens,
          outputTokens: data.usage?.completion_tokens,
        },
      };
    } catch (err) {
      const { kind, message } = classifyNetworkError(err);
      return { text: "", model, provider: opts.id, error: { kind, message } };
    }
  },
});

export const AnthropicProvider = OpenAICompatibleProvider({
  id: "anthropic",
  label: "Anthropic (Claude)",
  baseUrl: "https://api.anthropic.com/v1/messages",
  defaultModel: "claude-sonnet-4-5",
  models: ["claude-opus-4-5", "claude-sonnet-4-5", "claude-haiku-4-5"],
  requiresKey: true,
  wire: "anthropic",
});

export const OpenAIProvider = OpenAICompatibleProvider({
  id: "openai",
  label: "OpenAI",
  baseUrl: "https://api.openai.com/v1/chat/completions",
  defaultModel: "gpt-4.1",
  models: ["gpt-4.1", "gpt-4.1-mini", "o4-mini"],
  requiresKey: true,
});

export const GeminiProvider = OpenAICompatibleProvider({
  id: "gemini",
  label: "Google Gemini",
  // OpenAI-compatible shim — one wire format covers OpenAI and Gemini.
  baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
  defaultModel: "gemini-2.5-flash",
  models: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"],
  requiresKey: true,
});

export const OllamaProvider = OpenAICompatibleProvider({
  id: "ollama",
  label: "Ollama (local)",
  baseUrl: "http://127.0.0.1:11434/v1/chat/completions",
  defaultModel: "llama3.1:8b",
  models: ["llama3.1:8b", "qwen2.5-coder:7b", "gemma2:9b"],
  requiresKey: false,
});

export const PROVIDERS: Record<ProviderId, Provider> = {
  anthropic: AnthropicProvider,
  openai: OpenAIProvider,
  gemini: GeminiProvider,
  ollama: OllamaProvider,
  local: {
    id: "local",
    label: "Offline tutor (no model required)",
    requiresKey: false,
    defaultModel: "deterministic",
    models: ["deterministic"],
    async chat(req) {
      // The offline tutor never fabricates model output. It returns the
      // deterministic framework string that the caller supplies.
      return { text: req.messages.at(-1)?.content ?? "", model: "deterministic", provider: "local" };
    },
  },
};

export function getProvider(id: ProviderId): Provider {
  return PROVIDERS[id];
}
