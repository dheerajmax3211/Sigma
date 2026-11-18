/**
 * Build-time content validation.
 *
 * Fails the build when a content file is malformed, references an unknown
 * prerequisite, ships a problem whose solution does not actually pass its own
 * test cases, or breaks the syllabus chain. The reference app validated content at
 * request time with Zod, which meant a broken file surfaced as a runtime error
 * for a learner rather than as a CI failure.
 *
 * The syllabus checks are the important ones for the "every track is the
 * stepping stone for the next" requirement: they make the learning chain a
 * checkable property of the corpus rather than a claim in a document.
 */
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { loadContent, CONTENT_ROOT } from "../src/lib/content/loader";
import { runPython } from "../src/lib/exec/sandbox";

const content = loadContent(CONTENT_ROOT);

/** True when a JSON literal contains a number anywhere (so floats are compared). */
function isNumericJson(raw: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return false;
  }
  const walk = (v: unknown): boolean => {
    if (typeof v === "number") return true;
    if (Array.isArray(v)) return v.some(walk);
    if (v && typeof v === "object") return Object.values(v).some(walk);
    return false;
  };
  return walk(parsed);
}

/**
 * A literal double backslash in *parsed* text is a KaTeX line break, not a
 * command.
 *
 * `"$\\sigma$"` in a double-quoted YAML scalar unescapes to `$\sigma$` and is
 * correct. `\\sigma` inside a BLOCK scalar stays doubled, and KaTeX renders it
 * as a newline followed by the text "sigma" — so the equation silently breaks
 * while still producing valid HTML and a non-zero KaTeX span count. That is
 * invisible to every check except this one.
 */
function doubleBackslashFields(topic: {
  id: string;
  body: {
    markdown: string;
    big_idea?: string;
    analogy?: string;
    concept_points: string[];
    definitions: { term: string; meaning: string }[];
    derivations: { latex?: string; prose?: string }[];
    implementations: { note?: string; code: string }[];
    problems: { prompt: string; solutionExplanation?: string }[];
    hints: { content: string; blocks: { body: string }[] }[];
  };
}): string[] {
  const bad: string[] = [];
  const check = (field: string, s: string | undefined) => {
    if (s && s.includes("\\\\")) bad.push(field);
  };
  const b = topic.body;
  check("markdown", b.markdown);
  check("big_idea", b.big_idea);
  check("analogy", b.analogy);
  b.concept_points.forEach((p, i) => check(`concept_points[${i}]`, p));
  b.definitions.forEach((d, i) => {
    check(`definitions[${i}].term`, d.term);
    check(`definitions[${i}].meaning`, d.meaning);
  });
  b.derivations.forEach((d, i) => check(`derivations[${i}].latex`, d.latex));
  b.implementations.forEach((d, i) => check(`implementations[${i}].note`, d.note));
  b.problems.forEach((p, i) => check(`problems[${i}].solutionExplanation`, p.solutionExplanation));
  b.hints.forEach((h, i) => {
    check(`hints[${i}].content`, h.content);
    h.blocks.forEach((bl, j) => check(`hints[${i}].blocks[${j}]`, bl.body));
  });
  return bad;
}

let failures = 0;
/** Authoring-quality issues the renderer normalises, so they must not fail the build. */
let warnings = 0;
/** Topics whose rehearsal loop is incomplete — reported once, not per topic. */
const loopGaps: string[] = [];
/** Topics that exist on disk but are not in the curated syllabus order. */
const unscheduled: string[] = [];
const fail = (msg: string) => {
  failures++;
  console.error(`  ✗ ${msg}`);
};

console.log(`Content root: ${CONTENT_ROOT}`);
console.log(`Tracks: ${content.tracks.length}  Topics: ${content.topics.length}`);

if (content.errors.length) {
  console.error(`\nSchema / reference errors (${content.errors.length}):`);
  for (const e of content.errors) fail(e);
}

// ── Per-topic checks ──────────────────────────────────────────────────────
for (const t of content.topics) {
  // Hint ladder completeness.
  const tiers = new Set(t.body.hints.map((h) => h.tier));
  for (const tier of [1, 2, 3, 4, 5]) {
    if (!tiers.has(tier)) {
      fail(`topic "${t.id}": missing hint tier ${tier}`);
    }
  }

  // Structured pedagogy. A topic with no `big_idea` is a documentation
  // page, not a lesson.
  if (!t.body.big_idea) {
    fail(`topic "${t.id}": no big_idea — every topic needs one sentence stating the idea`);
  }
  if (t.body.concept_points.length < 4) {
    fail(`topic "${t.id}": only ${t.body.concept_points.length} concept_points (want at least 4)`);
  }
  if (t.body.problem.length === 0) {
    fail(`topic "${t.id}": no "problem" bullets — every topic needs to say why it matters`);
  }
  if (t.body.diagrams.length === 0) {
    fail(`topic "${t.id}": no diagrams — every topic needs at least one structured visual`);
  }

  // ── The loop ────────────────────────────────────────────────────────
  // A topic that ends without asking the learner to produce something is a
  // reading page. The benchmark product closes every teaching unit with a
  // micro-exercise and an interview question, so parity means these four
  // fields are not optional.
  //
  // Authoring runs with LOOP_GATE unset (warn, aggregated once at the end) so
  // a partially-migrated corpus still validates; the release gate runs with
  // LOOP_GATE=error and must be green.
  const loopGap: string[] = [];
  if (!t.body.try_it || t.body.try_it.trim().length < 20) loopGap.push("try_it");
  if (t.body.interview_questions.length < 3)
    loopGap.push(`interview_questions(${t.body.interview_questions.length})`);
  if (t.body.common_mistakes.length < 3)
    loopGap.push(`common_mistakes(${t.body.common_mistakes.length})`);
  if (t.body.further_reading.length < 2)
    loopGap.push(`further_reading(${t.body.further_reading.length})`);
  if (loopGap.length > 0) {
    loopGaps.push(`${t.id}: ${loopGap.join(", ")}`);
    if (process.env.LOOP_GATE === "error") {
      fail(`topic "${t.id}": rehearsal loop incomplete — missing ${loopGap.join(", ")}`);
    }
  }
  for (const q of t.body.interview_questions) {
    if (q.key_points.length < 2) {
      fail(`topic "${t.id}": interview question "${q.question.slice(0, 48)}…" needs at least 2 key_points`);
    }
  }

  // A doubled backslash renders as a line break, not a command. The renderer
  // normalises `\\` + letter, so this is a warning about authoring quality
  // rather than a build failure — but it is printed loudly because the content
  // should say `\sigma`, not `\\sigma`.
  for (const field of doubleBackslashFields(t)) {
    warnings++;
    console.warn(
      `  ⚠ topic "${t.id}": ${field} contains a doubled backslash — ` +
        `write \\sigma, not \\\\sigma (rendering is normalised, content is not)`,
    );
  }

  // Visualizer sanity.
  for (const v of t.body.visualizers) {
    if (!v.title) fail(`topic "${t.id}": visualizer "${v.id}" has no title`);
  }

  // Problem sanity.
  for (const p of t.body.problems) {
    if (!p.solution) {
      fail(`topic "${t.id}": problem "${p.id}" has no reference solution`);
      continue;
    }
    if (!p.testCases.length) {
      fail(`topic "${t.id}": problem "${p.id}" has no test cases`);
      continue;
    }
    if (p.testCases.some((c) => c.expected === undefined)) {
      fail(`topic "${t.id}": problem "${p.id}" has a test case with no expected value`);
    }
    // Float answers need a tolerance; exact equality on floats fails for the
    // wrong reason. Booleans and strings do not: `true` is exact by nature.
    for (const c of p.testCases) {
      if (c.expected && c.mode !== "exact" && !c.tolerance && isNumericJson(c.expected)) {
        fail(
          `topic "${t.id}": problem "${p.id}" test case has a numeric expected value ` +
            `("${c.expected.slice(0, 40)}") with no tolerance`,
        );
      }
    }
  }
}

// ── Syllabus: the chain ────────────────────────────────────────────────────
const syllabusPath = path.join(CONTENT_ROOT, "syllabus.yaml");
if (fs.existsSync(syllabusPath)) {
  console.log("\nChecking the syllabus chain…");
  const syllabus = YAML.parse(fs.readFileSync(syllabusPath, "utf-8")) as {
    tracks: {
      id: string;
      title: string;
      topics: { id: string; title: string; pos: number; prereq: string[] }[];
    }[];
  };

  const byId = new Map(content.topicsById);
  const syllabusIds = new Set<string>();
  const trackOf = new Map<string, string>();
  const missing: string[] = [];

  for (const track of syllabus.tracks) {
    const seen = new Set<string>();
    for (const st of track.topics) {
      syllabusIds.add(st.id);
      trackOf.set(st.id, track.id);
      if (seen.has(st.id)) fail(`syllabus: duplicate topic id "${st.id}" in track ${track.id}`);
      seen.add(st.id);

      const topic = byId.get(st.id);
      if (!topic) {
        // Not yet authored. That is progress, not a failure — the syllabus is
        // the plan, and the corpus catches up to it.
        missing.push(st.id);
        continue;
      }

      if (topic.position !== st.pos) {
        fail(
          `topic "${st.id}": position ${topic.position} does not match the syllabus (${st.pos})`,
        );
      }

      // The syllabus is the plan and the topic file is the delivery; when their
      // titles drift, the track page and the plan disagree and nobody notices.
      // Two had already diverged because a better title was written into the
      // file and never propagated back. A warning, not a failure — the file
      // title is usually the better one, so the fix is to update the syllabus.
      if (st.title && topic.title !== st.title) {
        warnings++;
        console.warn(
          `  ⚠ topic "${st.id}": title differs from the syllabus\n` +
            `      syllabus: ${st.title}\n` +
            `      topic:    ${topic.title}`,
        );
      }
      if (topic.prerequisites.length !== st.prereq.length ||
          !st.prereq.every((p) => topic.prerequisites.includes(p))) {
        fail(
          `topic "${st.id}": prerequisites [${topic.prerequisites.join(", ")}] do not match ` +
            `the syllabus [${st.prereq.join(", ")}]`,
        );
      }

      // Prerequisites must resolve, and must appear EARLIER in the same track
      // so the track can be studied top to bottom.
      const prereqPos = new Map(track.topics.map((t) => [t.id, t.pos]));
      for (const p of topic.prerequisites) {
        if (!byId.has(p)) {
          fail(`topic "${st.id}": prerequisite "${p}" has no content`);
          continue;
        }
        if (prereqPos.has(p) && (prereqPos.get(p) ?? 0) >= st.pos) {
          fail(
            `topic "${st.id}": prerequisite "${p}" is not earlier in track ${track.id} ` +
              `(pos ${prereqPos.get(p)} >= ${st.pos})`,
          );
        }
      }
    }
  }

  // Syllabus membership is a *sequencing* concern, not a validity one.
  //
  // The authoritative placement is the directory plus its `track.yaml`: that is
  // what the loader reads, and it is what broke silently when the seventh track
  // had no track file at all. `syllabus.yaml` is now the curated order and the
  // prerequisite overrides; a topic absent from it is unscheduled, not invalid.
  // Failing here would force a 100-entry YAML edit for every new topic while
  // catching none of the drift that actually matters.
  for (const t of content.topics) {
    if (!syllabusIds.has(t.id)) {
      unscheduled.push(t.id);
    }
  }

  // The prerequisite graph must be acyclic.
  const state = new Map<string, number>();
  const visit = (id: string, stack: string[]): void => {
    const s = state.get(id) ?? 0;
    if (s === 1) {
      fail(`prerequisite cycle: ${[...stack, id].join(" → ")}`);
      return;
    }
    if (s === 2) return;
    state.set(id, 1);
    for (const p of byId.get(id)?.prerequisites ?? []) visit(p, [...stack, id]);
    state.set(id, 2);
  };
  for (const t of content.topics) visit(t.id, []);

  const planned = syllabus.tracks.reduce((n, t) => n + t.topics.length, 0);
  const written = content.topics.length;
  console.log(
    `  ${written}/${planned} syllabus topics authored ` +
      `(${Math.round((written / planned) * 100)}% of the planned corpus); ` +
      `${missing.length} still to write`,
  );
  for (const id of missing) {
    console.log(`    · ${id}`);
  }
}

if (failures) {
  console.error(`\n${failures} content problem(s) found.`);
  process.exit(1);
}

// ── Execute every reference solution against its own test cases ───────────
console.log("\nVerifying reference solutions execute and pass…");
let ran = 0;
let solutionFailures = 0;

for (const t of content.topics) {
  for (const p of t.body.problems) {
    if (!p.solution || !p.testCases.length) continue;
    const res = await runPython({
      code: p.solution,
      language: p.language,
      entry: p.entry,
      testCases: p.testCases.map((c) => ({
        input: c.input,
        expected: c.expected,
        mode: c.mode,
        tolerance: c.tolerance,
      })),
      timeoutMs: 8000,
    });
    ran++;
    if (res.status !== "ok") {
      solutionFailures++;
      fail(`problem "${p.id}": solution run status ${res.status} — ${res.stderr.slice(0, 300)}`);
      continue;
    }
    if (res.passedCount !== res.totalCount) {
      solutionFailures++;
      const failing = res.testResults?.filter((r) => !r.passed) ?? [];
      fail(
        `problem "${p.id}": solution passed ${res.passedCount}/${res.totalCount} — ` +
          failing.map((f) => `#${f.index} expected ${f.expected} got ${f.actual ?? f.error}`).join("; "),
      );
    }
  }
}

if (solutionFailures) {
  console.error(`\n${solutionFailures} reference solution(s) failed.`);
  process.exit(1);
}

if (warnings > 0) {
  console.log(
    `\n⚠ ${warnings} authoring warning(s): doubled backslashes. The renderer ` +
      `normalises them, so they render correctly, but the content should say ` +
      `\\sigma rather than \\\\sigma.`,
  );
}
if (loopGaps.length > 0) {
  console.log(
    `\n⚠ ${loopGaps.length}/${content.topics.length} topic(s) have an incomplete rehearsal loop ` +
      `(try_it / 3 interview_questions / 3 common_mistakes / 2 further_reading).`,
  );
  if (process.env.LOOP_GATE === "error") {
    console.error("  LOOP_GATE=error — the release gate requires every topic to close the loop.");
  } else {
    console.log("  Run with LOOP_GATE=error to make this a release gate.");
  }
}
if (unscheduled.length > 0) {
  console.log(
    `\n⚠ ${unscheduled.length} topic(s) are not in syllabus.yaml (unscheduled, not invalid): ` +
      unscheduled.slice(0, 8).join(", ") + (unscheduled.length > 8 ? ", …" : ""),
  );
}
console.log(`\n✓ ${content.topics.length} topic(s) valid, ${ran} reference solution(s) pass their tests.`);
