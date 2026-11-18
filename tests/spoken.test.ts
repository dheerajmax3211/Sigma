import { test } from "node:test";
import assert from "node:assert/strict";
import { speakTex } from "../src/lib/math/spoken";

const cases: [string, string][] = [
  // The formula the learner could not read.
  [
    "\\|A - A_k\\|_F = \\sqrt{\\sum_{i>k} \\sigma_i^2} = \\sqrt{0.113803}",
    "the Frobenius norm of A minus A sub k equals the square root of the sum over i greater than k of sigma sub i squared equals the square root of 0.113803",
  ],
  ["\\frac{a}{b}", "a over b"],
  ["\\sqrt{x}", "the square root of x"],
  ["x^2", "x squared"],
  ["\\sum_{i=1}^{n} x_i", "the sum from i equals 1 to n of x sub i"],
  ["\\|x\\|_2", "the Euclidean norm of x"],
  ["\\alpha \\cdot \\beta", "alpha times beta"],
  ["\\mathbb{E}[x]", "the expectation of x"],
  ["a \\geq b", "a greater than or equal to b"],
  ["W^T x", "W transpose x"],
];

for (const [tex, expected] of cases) {
  test(`speaks ${tex}`, () => {
    assert.equal(speakTex(tex), expected);
  });
}

test("refuses unknown commands instead of guessing", () => {
  assert.equal(speakTex("\\weirdcommand{x}"), null);
});

test("function names in a subscript read short", () => {
  assert.equal(speakTex("L_{\\max} = n \\tau"), "L sub max equals n tau");
});

test("\\bar\\alpha without braces reads as alpha bar", () => {
  assert.equal(speakTex("\\bar\\alpha_t"), "alpha bar sub t");
});

test("a transpose superscript reads as transpose, not 'to the power'", () => {
  assert.equal(speakTex("A = L L^{\\top}"), "A equals L L transpose");
});

test("a doubled backslash command still reads (authoring wart)", () => {
  assert.equal(speakTex("\\\\sum_i p_i"), "the sum from i of p sub i");
});

test("a multi-line fraction reads across the newline", () => {
  assert.equal(speakTex("\\frac{a}\n   {b}"), "a over b");
});

test("bmatrix reads as rows instead of being refused", () => {
  assert.equal(
    speakTex("\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}"),
    "the matrix with row 1: a, b; row 2: c, d",
  );
});

test("cases reads as conditionals", () => {
  assert.equal(
    speakTex("\\begin{cases} 1 & x > 0 \\\\ 0 & x \\le 0 \\end{cases}"),
    "cases: 1, if x is greater than 0; 0, if x less than or equal to 0",
  );
});

test("a decorative superscript does not erase the sentence", () => {
  assert.equal(speakTex("O^{*} = 5"), "O equals 5");
});

test("escaped currency reads as dollars", () => {
  assert.equal(speakTex("\\frac{\\$}{10^6}"), "dollars over 10 to the power 6");
});
