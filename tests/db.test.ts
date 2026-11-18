import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getDb, closeDb, migrate, currentVersion } from "../src/lib/db";
import { SCHEMA_VERSION } from "../src/lib/db/schema";

const dir = mkdtempSync(path.join(tmpdir(), "sigma-db-"));
process.env.SIGMA_DATA_DIR = dir;

test("migrations run and record a version", () => {
  const db = getDb();
  assert.equal(currentVersion(db), SCHEMA_VERSION);
});

test("all expected tables exist", () => {
  const db = getDb();
  const names = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
    .all()
    .map((r) => (r as { name: string }).name);

  for (const expected of [
    "track",
    "topic",
    "prerequisite",
    "learner",
    "topic_progress",
    "coach_session",
    "coach_message",
    "execution",
    "analysis",
    "memory_note",
    "credential",
    "interview_session",
    "interview_turn",
    "topic_fts",
    "memory_fts",
    "schema_migration",
  ]) {
    assert.ok(names.includes(expected), `missing table: ${expected}`);
  }
});

test("content is seeded so topic foreign keys resolve", () => {
  const db = getDb();
  const topics = db.prepare(`SELECT COUNT(*) AS n FROM topic`).get() as { n: number };
  assert.ok(topics.n > 0, "expected seeded topics");

  const tracks = db.prepare(`SELECT COUNT(*) AS n FROM track`).get() as { n: number };
  assert.ok(tracks.n > 0, "expected seeded tracks");
});

test("FTS index is populated and queryable", () => {
  const db = getDb();
  const hits = db
    .prepare(`SELECT topic_id FROM topic_fts WHERE topic_fts MATCH 'eigen'`)
    .all() as { topic_id: string }[];
  assert.ok(hits.length > 0, "expected FTS hits for 'eigen'");
});

test("migrating twice is idempotent", () => {
  const db = getDb();
  const before = currentVersion(db);
  migrate(db);
  assert.equal(currentVersion(db), before);
});

test("coach session accepts a seeded topic", () => {
  const db = getDb();
  const topic = db.prepare(`SELECT id FROM topic LIMIT 1`).get() as { id: string };
  db.prepare(`INSERT INTO learner (id, display_name) VALUES ('lrn_test', 'T')`).run();
  db.prepare(
    `INSERT INTO coach_session (id, learner_id, topic_id, kind, title, tier, status, state, created_at, updated_at)
     VALUES ('ses_test', 'lrn_test', ?, 'topic', 't', 0, 'active', '{}', 'now', 'now')`,
  ).run(topic.id);

  const row = db
    .prepare(`SELECT topic_id FROM coach_session WHERE id = 'ses_test'`)
    .get() as { topic_id: string };
  assert.equal(row.topic_id, topic.id);
});

test("a session referencing a nonexistent topic is rejected by the foreign key", () => {
  const db = getDb();
  db.prepare(`INSERT OR IGNORE INTO learner (id, display_name) VALUES ('lrn_fk', 'T')`).run();
  assert.throws(
    () =>
      db
        .prepare(
          `INSERT INTO coach_session (id, learner_id, topic_id, kind, title, tier, status, state, created_at, updated_at)
           VALUES ('ses_fk', 'lrn_fk', 'no_such_topic', 'topic', 't', 0, 'active', '{}', 'now', 'now')`,
        )
        .run(),
    /FOREIGN KEY/,
  );
});

test.after(() => {
  closeDb();
  rmSync(dir, { recursive: true, force: true });
});
