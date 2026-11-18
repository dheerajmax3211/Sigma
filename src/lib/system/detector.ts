import os from "node:os";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

/**
 * Local hardware detection.
 *
 * Deliberately dependency-free: `node:os` covers everything except the
 * marketing name of an Apple Silicon chip, which requires one guarded
 * `sysctl` call. Nothing here reaches the network, and nothing here throws —
 * a machine where `statfs` is denied is a machine with an *unknown* free
 * disk, not a broken machine.
 */

const BYTES_PER_GB = 1e9;

export interface SystemSpecs {
  platform: NodeJS.Platform;
  arch: string;
  /** Raw CPU model string from `os.cpus()[0].model`. */
  cpuModel: string;
  /** Logical core count. */
  cores: number;
  totalRamGb: number;
  freeRamGb: number;
  /** Free space on the user's home volume. `null` when it cannot be read. */
  freeDiskGb: number | null;
  isAppleSilicon: boolean;
  /** Marketing chip name (e.g. "Apple M3 Pro") when it can be determined. */
  chip: string | null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function readAppleChip(): string | null {
  if (process.platform !== "darwin" || process.arch !== "arm64") return null;
  try {
    const out = execFileSync("sysctl", ["-n", "machdep.cpu.brand_string"], {
      encoding: "utf8",
      timeout: 800,
      // stderr is discarded: a missing sysctl key is expected on some hosts,
      // and it must not leak noise into the server log.
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return out.length > 0 ? out : null;
  } catch {
    // Sandboxed, missing, or slow — fall back to the os.cpus() model string.
    return null;
  }
}

function readFreeDiskGb(): number | null {
  try {
    const stats = fs.statfsSync(os.homedir());
    const freeBytes = Number(stats.bavail) * Number(stats.bsize);
    const freeGb = freeBytes / BYTES_PER_GB;
    return Number.isFinite(freeGb) ? round1(freeGb) : null;
  } catch {
    return null;
  }
}

export function detectSystem(): SystemSpecs {
  const cpus = os.cpus();
  const first = cpus[0];
  const totalRamGb = round1(os.totalmem() / BYTES_PER_GB);
  const freeRamGb = round1(os.freemem() / BYTES_PER_GB);
  const isAppleSilicon = process.platform === "darwin" && process.arch === "arm64";
  const chip = readAppleChip();

  return {
    platform: process.platform,
    arch: process.arch,
    cpuModel: first?.model?.trim() || "unknown",
    cores: cpus.length,
    totalRamGb,
    freeRamGb,
    freeDiskGb: readFreeDiskGb(),
    isAppleSilicon,
    chip,
  };
}
