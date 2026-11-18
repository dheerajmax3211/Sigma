import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dot,
  eckartYoungResidual,
  jacobiEigen,
  matMul,
  matVec,
  mulberry32,
  norm,
  scale,
  svd,
  transpose,
} from "../src/lib/viz/linalg";

test("matMul and transpose are correct", () => {
  const a = [
    [1, 2],
    [3, 4],
  ];
  const b = [
    [5, 6],
    [7, 8],
  ];
  assert.deepEqual(matMul(a, b), [
    [19, 22],
    [43, 50],
  ]);
  assert.deepEqual(transpose(a), [
    [1, 3],
    [2, 4],
  ]);
});

test("matVec and norm are correct", () => {
  assert.deepEqual(matVec([[1, 2], [3, 4]], [1, 1]), [3, 7]);
  assert.ok(Math.abs(norm([3, 4]) - 5) < 1e-12);
});

test("jacobiEigen recovers the eigenvalues of a symmetric matrix", () => {
  // [[2,1],[1,2]] has eigenvalues 1 and 3.
  const { values, vectors } = jacobiEigen([
    [2, 1],
    [1, 2],
  ]);
  assert.ok(Math.abs(values[0] - 3) < 1e-10);
  assert.ok(Math.abs(values[1] - 1) < 1e-10);
});

test("eigenvectors of a symmetric matrix are orthonormal", () => {
  const { vectors } = jacobiEigen([
    [4, 1, 0],
    [1, 3, 1],
    [0, 1, 2],
  ]);
  assert.ok(Math.abs(norm(vectors[0]) - 1) < 1e-9);
  assert.ok(Math.abs(norm(vectors[1]) - 1) < 1e-9);
  assert.ok(Math.abs(dot(vectors[0], vectors[1])) < 1e-9);
});

test("eigenvectors satisfy A v = lambda v", () => {
  const A = [
    [4, 1, 0],
    [1, 3, 1],
    [0, 1, 2],
  ];
  const { values, vectors } = jacobiEigen(A);
  for (let i = 0; i < vectors.length; i++) {
    const av = matVec(A, vectors[i]);
    const lv = scale(vectors[i], values[i]);
    for (let j = 0; j < av.length; j++) {
      assert.ok(Math.abs(av[j] - lv[j]) < 1e-9, `component ${j} of pair ${i}`);
    }
  }
});

test("svd recovers singular values of a rank-1 matrix", () => {
  // Outer product u v^T has a single non-zero singular value |u||v|.
  const u = [1, 2, 3];
  const v = [4, 5];
  const A = u.map((ui) => v.map((vj) => ui * vj));
  const { values } = svd(A);
  const expected = Math.sqrt(1 + 4 + 9) * Math.sqrt(16 + 25);
  assert.ok(Math.abs(values[0] - expected) < 1e-9, `got ${values[0]}, expected ${expected}`);

  // The second singular value should be zero in exact arithmetic. It is not
  // exactly zero numerically, and the reason is worth stating: Jacobi's
  // ABSOLUTE accuracy on eigenvalues is ~eps*||A||. For a rank-1 matrix the
  // tiny eigenvalue of A^T A is ~1e-16, and taking a square root turns that
  // absolute error into a ~1e-8 relative error in the singular value. So the
  // correct assertion is "small relative to the largest", not "exactly zero".
  assert.ok(
    values[1] < 1e-6 * values[0],
    `second singular value ${values[1]} should be negligible vs ${values[0]}`,
  );
});

test("svd of a symmetric PSD matrix matches its eigenvalues", () => {
  const A = [
    [4, 1, 0],
    [1, 3, 1],
    [0, 1, 2],
  ];
  // A is symmetric, so A^T A = A². The eigenvalues of A² are λ_i², and
  // σ_i = sqrt(λ_i²) = λ_i for positive λ_i.
  const { values: sigma } = svd(A);
  const { values: eig } = jacobiEigen(A);
  for (let i = 0; i < eig.length; i++) {
    assert.ok(Math.abs(sigma[i] - Math.abs(eig[i])) < 1e-9, `sigma=${sigma[i]} eig=${eig[i]}`);
  }
});

test("singular values of a non-symmetric matrix are the sqrt of A^T A eigenvalues", () => {
  const A = [
    [1, 2],
    [3, 4],
    [5, 6],
  ];
  const { values: sigma } = svd(A);
  const ata = matMul(transpose(A), A);
  const { values: eig } = jacobiEigen(ata);
  for (let i = 0; i < eig.length; i++) {
    assert.ok(Math.abs(sigma[i] - Math.sqrt(Math.max(0, eig[i]))) < 1e-9);
  }
});

test("Eckart–Young residual matches the truncated singular values", () => {
  const sigma = [3, 2, 1];
  assert.ok(Math.abs(eckartYoungResidual(sigma, 2) - Math.sqrt(1)) < 1e-12);
  assert.ok(Math.abs(eckartYoungResidual(sigma, 0) - Math.sqrt(14)) < 1e-12);
  assert.ok(Math.abs(eckartYoungResidual(sigma, 3)) < 1e-12);
});

test("mulberry32 is deterministic", () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 20; i++) assert.equal(a(), b());
});
