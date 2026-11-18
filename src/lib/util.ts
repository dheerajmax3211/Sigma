import { randomUUID } from "node:crypto";

/** Stable ids without pulling in a uuid dependency. */
export function newId(prefix = ""): string {
  const id = randomUUID();
  return prefix ? `${prefix}_${id}` : id;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** SQLite has no boolean type; normalise to 0/1 at the boundary. */
export function bool(v: boolean): number {
  return v ? 1 : 0;
}

export function fromBool(v: unknown): boolean {
  return v === 1 || v === "1" || v === true;
}

/** Parse a JSON column, tolerating null/blank and malformed content. */
export function parseJson<T>(raw: unknown, fallback: T): T {
  if (raw == null) return fallback;
  if (typeof raw === "object") return raw as T;
  try {
    const parsed = JSON.parse(String(raw));
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

export function toJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

/** Deterministic float32 blob for local embeddings. */
export function floatsToBlob(values: Float32Array): Buffer {
  return Buffer.from(values.buffer, values.byteOffset, values.byteLength);
}

export function blobToFloats(blob: Buffer | Uint8Array): Float32Array {
  const b = Buffer.from(blob);
  const copy = new ArrayBuffer(b.byteLength);
  new Uint8Array(copy).set(b);
  return new Float32Array(copy);
}
