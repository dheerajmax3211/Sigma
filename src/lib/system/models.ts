import type { SystemSpecs } from "./detector";

/**
 * The model recommendation matrix.
 *
 * This is data, not logic: the bands below are the only thing that changes
 * when the local-model landscape moves. `recommend()` is a lookup over
 * `totalRamGb` and a sentence explaining the choice.
 *
 * Sizes are `q4_K_M` weights as published on the Ollama library, rounded.
 * They are approximate on purpose — the UI says "~", because the real
 * download depends on the quantisation the daemon resolves.
 */

export interface ModelEntry {
  /** Ollama tag, e.g. "llama3.1:8b". */
  id: string;
  label: string;
  /** Parameter count in billions. */
  paramsB: number;
  quant: string;
  approxDiskGb: number;
  note: string;
}

export interface ModelBand {
  /** Exclusive upper bound on system RAM, in GB. `Infinity` for the top band. */
  upToRamGb: number;
  primary: ModelEntry;
  coding: ModelEntry;
}

export interface Recommendation {
  primary: ModelEntry;
  coding: ModelEntry;
  /** Plain-English justification naming the detected RAM. */
  reason: string;
}

export const MODEL_MATRIX: readonly ModelBand[] = [
  {
    upToRamGb: 12,
    primary: {
      id: "llama3.2:3b",
      label: "Llama 3.2 3B",
      paramsB: 3,
      quant: "q4_K_M",
      approxDiskGb: 2.5,
      note: "Fast enough for back-and-forth chat on 8 GB machines; weaker at multi-step maths.",
    },
    coding: {
      id: "qwen2.5-coder:1.5b",
      label: "Qwen2.5 Coder 1.5B",
      paramsB: 1.5,
      quant: "q4_K_M",
      approxDiskGb: 1,
      note: "Completion-scale: good for short snippets, not for whole-file refactors.",
    },
  },
  {
    upToRamGb: 20,
    primary: {
      id: "llama3.1:8b",
      label: "Llama 3.1 8B",
      paramsB: 8,
      quant: "q4_K_M",
      approxDiskGb: 5.8,
      note: "The sweet spot: solid reasoning at a size that still fits an 8 GB machine.",
    },
    coding: {
      id: "qwen2.5-coder:7b",
      label: "Qwen2.5 Coder 7B",
      paramsB: 7,
      quant: "q4_K_M",
      approxDiskGb: 4.7,
      note: "Strong on Python and TypeScript for its size; pair it with the primary model.",
    },
  },
  {
    upToRamGb: 40,
    primary: {
      id: "qwen2.5:14b",
      label: "Qwen2.5 14B",
      paramsB: 14,
      quant: "q4_K_M",
      approxDiskGb: 10.5,
      note: "Noticeably better at derivations; wants ~16 GB free to stay responsive.",
    },
    coding: {
      id: "qwen2.5-coder:14b",
      label: "Qwen2.5 Coder 14B",
      paramsB: 14,
      quant: "q4_K_M",
      approxDiskGb: 9,
      note: "Handles multi-file edits; the best local coding model under 20 GB of weights.",
    },
  },
  {
    upToRamGb: Number.POSITIVE_INFINITY,
    primary: {
      id: "deepseek-r1:32b",
      label: "DeepSeek R1 32B",
      paramsB: 32,
      quant: "q4_K_M",
      approxDiskGb: 22,
      note: "Chain-of-thought reasoning for hard proofs; slow on CPU-only machines.",
    },
    coding: {
      id: "qwen2.5-coder:32b",
      label: "Qwen2.5 Coder 32B",
      paramsB: 32,
      quant: "q4_K_M",
      approxDiskGb: 19.5,
      note: "Repository-scale work, provided you have the memory to keep it resident.",
    },
  },
];

/** The band whose ceiling the machine falls under. */
export function bandFor(totalRamGb: number): ModelBand {
  const ram = Number.isFinite(totalRamGb) && totalRamGb > 0 ? totalRamGb : 0;
  for (const band of MODEL_MATRIX) {
    if (ram < band.upToRamGb) return band;
  }
  return MODEL_MATRIX[MODEL_MATRIX.length - 1];
}

export function recommend(specs: Pick<SystemSpecs, "totalRamGb">): Recommendation {
  const band = bandFor(specs.totalRamGb);
  const ram = specs.totalRamGb;
  const reason =
    `With ${ram} GB of memory detected, ${band.primary.label} ` +
    `(${band.primary.quant}, ~${band.primary.approxDiskGb} GB on disk) is the largest model that ` +
    `leaves comfortable headroom, and ${band.coding.label} covers the code work.`;
  return { primary: band.primary, coding: band.coding, reason };
}

/**
 * Whether a model fits in the free space reported by the detector.
 * One gigabyte of headroom is reserved for the daemon's own scratch files.
 */
export function fitsOnDisk(model: ModelEntry, freeDiskGb: number): boolean {
  if (!Number.isFinite(freeDiskGb)) return false;
  return freeDiskGb >= model.approxDiskGb + 1;
}
