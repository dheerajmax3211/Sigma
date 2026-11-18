/**
 * Sigma — schema design.
 *
 * Design goals vs. The reference app (v1.6.1):
 *  1. Versioned, transactional migrations. The reference app widened tables with bare
 *     `ALTER TABLE ADD COLUMN` and had no migration ledger, so there was no way
 *     to know what shape a given database was in.
 *  2. FTS5 full-text search over the knowledge base and notes.
 *  3. A first-class `hint_ladder` model: the tier a learner has reached is
 *     persisted server-side, not a client-side toggle.
 *  4. Mastery tracking with spaced-repetition scheduling.
 *  5. Execution results carry latency + memory, and keep the full transcript.
 */

/** Ordered migration ledger. Each entry runs exactly once, inside a transaction. */
export interface Migration {
  readonly id: number;
  readonly name: string;
  readonly sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    id: 1,
    name: "core",
    sql: /* sql */ `
      -- ── Content graph ─────────────────────────────────────────────────────
      -- The curriculum is a DAG: nodes have prerequisites, so the app can
      -- gate progression and compute the shortest path to any goal.
      CREATE TABLE IF NOT EXISTS track (
        id          TEXT PRIMARY KEY,
        slug        TEXT NOT NULL UNIQUE,
        title       TEXT NOT NULL,
        subtitle    TEXT,
        description TEXT,
        tier        INTEGER NOT NULL DEFAULT 0,   -- 0..5, higher = more senior
        color       TEXT,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS topic (
        id          TEXT PRIMARY KEY,
        track_id    TEXT NOT NULL REFERENCES track(id) ON DELETE CASCADE,
        slug        TEXT NOT NULL UNIQUE,
        title       TEXT NOT NULL,
        summary     TEXT,
        kind        TEXT NOT NULL DEFAULT 'lesson'
                      CHECK (kind IN ('lesson','problem','case_study','interview','lab','reference')),
        difficulty  TEXT NOT NULL DEFAULT 'medium'
                      CHECK (difficulty IN ('intro','easy','medium','hard','expert')),
        position    INTEGER NOT NULL DEFAULT 0,
        est_minutes INTEGER NOT NULL DEFAULT 30,
        body        TEXT,          -- markdown + KaTeX
        data        TEXT,          -- JSON blob for kind-specific fields
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_topic_track ON topic(track_id, position);

      CREATE TABLE IF NOT EXISTS prerequisite (
        topic_id       TEXT NOT NULL REFERENCES topic(id) ON DELETE CASCADE,
        prerequisite_id TEXT NOT NULL REFERENCES topic(id) ON DELETE CASCADE,
        PRIMARY KEY (topic_id, prerequisite_id)
      );
      CREATE INDEX IF NOT EXISTS idx_prereq_rev ON prerequisite(prerequisite_id);

      -- ── Learner state ─────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS learner (
        id            TEXT PRIMARY KEY,
        display_name  TEXT,
        created_at    TEXT NOT NULL DEFAULT (datetime('now')),
        -- JSON: { theme, editorFontSize, fontScale, defaultProvider, ... }
        settings      TEXT NOT NULL DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS topic_progress (
        id              TEXT PRIMARY KEY,
        learner_id      TEXT NOT NULL REFERENCES learner(id) ON DELETE CASCADE,
        topic_id        TEXT NOT NULL REFERENCES topic(id) ON DELETE CASCADE,
        status          TEXT NOT NULL DEFAULT 'not_started'
                          CHECK (status IN ('not_started','in_progress','mastered')),
        mastery         REAL NOT NULL DEFAULT 0,   -- 0..1
        attempts        INTEGER NOT NULL DEFAULT 0,
        last_seen_at    TEXT,
        mastered_at     TEXT,
        UNIQUE (learner_id, topic_id)
      );
      CREATE INDEX IF NOT EXISTS idx_progress_learner ON topic_progress(learner_id, status);

      -- ── Socratic coach sessions (Nexus) ───────────────────────────────────
      -- The stage model generalises the reference app's 5 linear stages into a tiered
      -- hint ladder that can be entered at any tier and climbed independently.
      CREATE TABLE IF NOT EXISTS coach_session (
        id          TEXT PRIMARY KEY,
        learner_id  TEXT NOT NULL REFERENCES learner(id) ON DELETE CASCADE,
        topic_id    TEXT REFERENCES topic(id) ON DELETE SET NULL,
        kind        TEXT NOT NULL DEFAULT 'topic'
                      CHECK (kind IN ('topic','problem','interview','freeform')),
        title       TEXT,
        -- Highest hint tier the learner has been shown (0 = none, 5 = solution)
        tier        INTEGER NOT NULL DEFAULT 0,
        status      TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','completed','abandoned')),
        -- JSON: accumulated session state (submissions, evidence, notes)
        state       TEXT NOT NULL DEFAULT '{}',
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_coach_session_learner
        ON coach_session(learner_id, status, updated_at DESC);

      CREATE TABLE IF NOT EXISTS coach_message (
        id          TEXT PRIMARY KEY,
        session_id  TEXT NOT NULL REFERENCES coach_session(id) ON DELETE CASCADE,
        role        TEXT NOT NULL CHECK (role IN ('user','coach','system')),
        tier        INTEGER NOT NULL DEFAULT 0,
        content     TEXT NOT NULL,
        -- JSON: structured annotations (code refs, complexity claims, derivations)
        annotations TEXT,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_coach_message_session
        ON coach_message(session_id, created_at);

      -- ── Code execution ────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS execution (
        id          TEXT PRIMARY KEY,
        session_id  TEXT REFERENCES coach_session(id) ON DELETE SET NULL,
        topic_id    TEXT REFERENCES topic(id) ON DELETE SET NULL,
        language    TEXT NOT NULL,
        code        TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'ok'
                      CHECK (status IN ('ok','error','timeout','rejected')),
        stdout      TEXT,
        stderr      TEXT,
        -- JSON: per-test-case results
        test_results TEXT,
        runtime_ms  INTEGER,
        memory_kb   INTEGER,
        exit_code   INTEGER,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_execution_session ON execution(session_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_execution_topic ON execution(topic_id, created_at DESC);

      -- ── Deterministic code analysis (AST) ─────────────────────────────────
      -- The profiler computes complexity from the AST. The LLM only explains.
      CREATE TABLE IF NOT EXISTS analysis (
        id          TEXT PRIMARY KEY,
        execution_id TEXT REFERENCES execution(id) ON DELETE CASCADE,
        language    TEXT NOT NULL,
        -- JSON: { timeComplexity, spaceComplexity, functions:[...], findings:[...] }
        result      TEXT NOT NULL,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_analysis_execution ON analysis(execution_id);

      -- ── Memory (long-term notes about the learner) ───────────────────────
      CREATE TABLE IF NOT EXISTS memory_note (
        id          TEXT PRIMARY KEY,
        learner_id  TEXT NOT NULL REFERENCES learner(id) ON DELETE CASCADE,
        kind        TEXT NOT NULL DEFAULT 'long_term'
                      CHECK (kind IN ('long_term','session','preference','observation')),
        category    TEXT NOT NULL DEFAULT 'general',
        topic_id    TEXT REFERENCES topic(id) ON DELETE SET NULL,
        content     TEXT NOT NULL,
        source      TEXT,
        embedding   BLOB,           -- Float32Array of a local embedding model
        embedding_dim INTEGER,
        expires_at  TEXT,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_memory_learner ON memory_note(learner_id, kind, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_memory_expires ON memory_note(expires_at);

      -- ── Provider credentials (metadata only; secrets live in the OS keychain)
      CREATE TABLE IF NOT EXISTS credential (
        id          TEXT PRIMARY KEY,
        learner_id  TEXT NOT NULL REFERENCES learner(id) ON DELETE CASCADE,
        provider    TEXT NOT NULL
                      CHECK (provider IN ('anthropic','openai','gemini','ollama','local')),
        label       TEXT,
        model       TEXT,
        base_url    TEXT,
        -- Reference into the OS keychain. Never the secret itself.
        keychain_ref TEXT,
        is_active   INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        last_used_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_credential_learner ON credential(learner_id, provider);

      -- ── Mock interviews ──────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS interview_session (
        id             TEXT PRIMARY KEY,
        learner_id     TEXT NOT NULL REFERENCES learner(id) ON DELETE CASCADE,
        kind           TEXT NOT NULL DEFAULT 'system_design'
                         CHECK (kind IN ('system_design','coding','behavioral','ml_system')),
        level          TEXT NOT NULL DEFAULT 'senior'
                         CHECK (level IN ('junior','mid','senior','staff','principal')),
        specialty      TEXT,
        status         TEXT NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active','completed','abandoned')),
        -- JSON: rubric, stage index, plan
        plan           TEXT NOT NULL DEFAULT '{}',
        overall_score  REAL,
        overall_feedback TEXT,
        created_at     TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at   TEXT
      );

      CREATE TABLE IF NOT EXISTS interview_turn (
        id             TEXT PRIMARY KEY,
        session_id     TEXT NOT NULL REFERENCES interview_session(id) ON DELETE CASCADE,
        stage          TEXT NOT NULL,
        mode           TEXT NOT NULL DEFAULT 'oral'
                         CHECK (mode IN ('oral','live_coding','review')),
        question       TEXT NOT NULL,
        answer         TEXT,
        rubric         TEXT,   -- JSON rubric the scorer used
        score          REAL,
        feedback       TEXT,
        ideal_answer   TEXT,
        reference_links TEXT,  -- JSON array of topic ids
        created_at     TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_interview_turn_session
        ON interview_turn(session_id, created_at);

      -- ── Search ───────────────────────────────────────────────────────────
      CREATE VIRTUAL TABLE IF NOT EXISTS topic_fts USING fts5(
        topic_id UNINDEXED,
        title,
        summary,
        body,
        tokenize = 'porter unicode61'
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
        note_id UNINDEXED,
        content,
        tokenize = 'porter unicode61'
      );
    `,
  },
  {
    id: 2,
    name: "spaced repetition",
    // `topic_progress` recorded attempts and mastery but had no notion of
    // *when* a topic should come back. A mastery number that never expires is
    // a number that only goes up; retention needs a due date.
    sql: /* sql */ `
      CREATE TABLE IF NOT EXISTS review_schedule (
        id            TEXT PRIMARY KEY,
        learner_id    TEXT NOT NULL REFERENCES learner(id) ON DELETE CASCADE,
        topic_id      TEXT NOT NULL REFERENCES topic(id) ON DELETE CASCADE,
        -- ISO date the topic is next due. NULL means never scheduled.
        due_at        TEXT,
        -- Days until the next review, as an integer so the schedule is stable.
        interval_days INTEGER NOT NULL DEFAULT 0,
        -- SM-2 ease factor, starts at 2.5 and is floored at 1.3.
        ease          REAL NOT NULL DEFAULT 2.5,
        reps          INTEGER NOT NULL DEFAULT 0,
        lapses        INTEGER NOT NULL DEFAULT 0,
        updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (learner_id, topic_id)
      );

      CREATE INDEX IF NOT EXISTS idx_review_due
        ON review_schedule(learner_id, due_at);

      -- A topic can be "mastered" and still be overdue. This index makes the
      -- "what should I study today" query cheap.
      CREATE INDEX IF NOT EXISTS idx_progress_mastery
        ON topic_progress(learner_id, mastery DESC);
    `,
  },
];

/**
 * The schema version is DERIVED from the migration list, never hand-maintained.
 *
 * A hard-coded constant drifts the moment a migration is added: the ledger
 * advances to 2, the constant still says 1, and every DB test fails with a
 * version mismatch that looks like a migration bug but is really a stale
 * literal. This must stay below `MIGRATIONS` — referencing it above would hit
 * the temporal dead zone.
 */
export const SCHEMA_VERSION = MIGRATIONS.reduce((max, m) => Math.max(max, m.id), 0);
