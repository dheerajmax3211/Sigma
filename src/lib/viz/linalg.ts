/**
 * Tiny linear-algebra engine for the browser visualizers.
 *
 * Deliberately dependency-free and synchronous: the visualizers need to
 * recompute on every slider drag, so a round trip to the server would make
 * them feel broken. Everything here is small enough to audit.
 *
 * The eigen-solver is the cyclic Jacobi method, which is short, numerically
 * stable for symmetric matrices, and converges quadratically — more than
 * enough for the 2x2 and 20x12 matrices these visualizers use.
 */

export type Mat = number[][];

export function matMul(a: Mat, b: Mat): Mat {
  const n = a.length;
  const m = b[0].length;
  const k = b.length;
  const out: Mat = Array.from({ length: n }, () => new Array(m).fill(0));
  for (let i = 0; i < n; i++) {
    for (let p = 0; p < k; p++) {
      const aip = a[i][p];
      if (aip === 0) continue;
      for (let j = 0; j < m; j++) out[i][j] += aip * b[p][j];
    }
  }
  return out;
}

export function transpose(a: Mat): Mat {
  return a[0].map((_, j) => a.map((row) => row[j]));
}

export function matVec(a: Mat, v: number[]): number[] {
  return a.map((row) => row.reduce((acc, x, j) => acc + x * v[j], 0));
}

export function norm(v: number[]): number {
  return Math.sqrt(v.reduce((s, x) => s + x * x, 0));
}

export function scale(v: number[], s: number): number[] {
  return v.map((x) => x * s);
}

export function dot(a: number[], b: number[]): number {
  return a.reduce((s, x, i) => s + x * b[i], 0);
}

export interface Eigen {
  /** Eigenvalues, descending. */
  values: number[];
  /** Eigenvectors as columns, aligned with `values`. */
  vectors: number[][];
}

/**
 * Cyclic Jacobi eigendecomposition for a symmetric matrix.
 * Returns eigenvalues in descending order with matching eigenvectors.
 */
export function jacobiEigen(input: Mat, maxSweeps = 100): Eigen {
  const n = input.length;
  const a = input.map((r) => r.slice());
  // Identity, accumulating the eigenvector rotation.
  let v: Mat = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  );

  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) off += a[i][j] * a[i][j];
    if (off < 1e-22) break;

    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-18) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t =
          Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;

        for (let k = 0; k < n; k++) {
          const akp = a[k][p];
          const akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k];
          const aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k][p];
          const vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }

  const idx = a.map((row, i) => ({ i, val: row[i] })).sort((x, y) => y.val - x.val);
  return {
    values: idx.map((x) => x.val),
    vectors: idx.map((x) => v.map((row) => row[x.i])),
  };
}

/**
 * SVD via the eigendecomposition of A^T A.
 * Returns singular values (descending) and the right singular vectors.
 */
export function svd(a: Mat): { values: number[]; rightVectors: number[][]; leftVectors: number[][] } {
  const ata = matMul(transpose(a), a);
  const { values, vectors } = jacobiEigen(ata);
  const sigma = values.map((x) => Math.sqrt(Math.max(0, x)));
  const rank = sigma.filter((s) => s > 1e-10 * Math.max(...sigma, 1)).length;

  const leftVectors: number[][] = [];
  for (let i = 0; i < vectors.length; i++) {
    const av = matVec(a, vectors[i]);
    const s = sigma[i];
    leftVectors.push(s > 1e-10 ? scale(av, 1 / s) : new Array(a.length).fill(0));
  }
  return { values: sigma, rightVectors: vectors, leftVectors, rank } as never;
}

/** Best rank-k approximation error (Eckart–Young), in Frobenius norm. */
export function eckartYoungResidual(sigma: number[], k: number): number {
  let sum = 0;
  for (let i = k; i < sigma.length; i++) sum += sigma[i] * sigma[i];
  return Math.sqrt(sum);
}

/** Deterministic PRNG so the visualizers look identical on every load. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A deterministic Gaussian-ish sample (Box–Muller). */
export function gaussian(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
