import type Database from "better-sqlite3";
import { getContent } from "@/lib/content/loader";

/**
 * Seed the database from the YAML content corpus.
 *
 * The content is authored in YAML (reviewable, diffable, no database tooling
 * required), but the database is the source of truth for *state* — progress,
 * sessions, notes. The topic/track tables therefore hold a projection of the
 * content, so foreign keys (progress → topic, session → topic) are real.
 *
 * Seeding is idempotent: it upserts tracks and topics and rebuilds the FTS
 * index. It runs on every boot because the content corpus can change between
 * runs, and because it is cheap (a few hundred rows).
 */

export interface SeedResult {
  tracks: number;
  topics: number;
  prerequisites: number;
  errors: string[];
}

export function seedContent(db: Database.Database): SeedResult {
  const content = getContent();
  const errors: string[] = [...content.errors];

  const upsertTrack = db.prepare(`
    INSERT INTO track (id, slug, title, subtitle, description, tier, color, sort_order)
    VALUES (@id, @slug, @title, @subtitle, @description, @tier, @color, @sortOrder)
    ON CONFLICT(id) DO UPDATE SET
      slug = excluded.slug,
      title = excluded.title,
      subtitle = excluded.subtitle,
      description = excluded.description,
      tier = excluded.tier,
      color = excluded.color,
      sort_order = excluded.sort_order
  `);

  const upsertTopic = db.prepare(`
    INSERT INTO topic (id, track_id, slug, title, summary, kind, difficulty, position, est_minutes, body, data)
    VALUES (@id, @track_id, @slug, @title, @summary, @kind, @difficulty, @position, @est_minutes, @body, @data)
    ON CONFLICT(id) DO UPDATE SET
      track_id = excluded.track_id,
      slug = excluded.slug,
      title = excluded.title,
      summary = excluded.summary,
      kind = excluded.kind,
      difficulty = excluded.difficulty,
      position = excluded.position,
      est_minutes = excluded.est_minutes,
      body = excluded.body,
      data = excluded.data
  `);

  const clearPrereqs = db.prepare(`DELETE FROM prerequisite WHERE topic_id = ?`);
  const addPrereq = db.prepare(
    `INSERT OR IGNORE INTO prerequisite (topic_id, prerequisite_id) VALUES (?, ?)`,
  );

  const run = db.transaction(() => {
    for (const t of content.tracks) {
      upsertTrack.run({
        id: t.id,
        slug: t.slug,
        title: t.title,
        subtitle: t.subtitle ?? null,
        description: t.description ?? null,
        tier: t.tier,
        color: t.color,
        sortOrder: t.sortOrder,
      });
    }

    // A topic may live in a directory that has no track header yet. The
    // foreign key on topic.track_id still has to hold, so create a stub.
    const knownTracks = new Set(content.tracks.map((t) => t.id));
    for (const topic of content.topics) {
      const trackId = topic.trackId ?? "foundations";
      if (!knownTracks.has(trackId)) {
        knownTracks.add(trackId);
        upsertTrack.run({
          id: trackId,
          slug: trackId,
          title: trackId.replace(/(^|-)([a-z])/g, (_m, _p, c: string) => ` ${c.toUpperCase()}`).trim(),
          subtitle: null,
          description: null,
          tier: 0,
          color: "#1cd6ac",
          sortOrder: 999,
        });
      }
    }

    for (const topic of content.topics) {
      const trackId = topic.trackId ?? "foundations";
      upsertTopic.run({
        id: topic.id,
        track_id: trackId,
        slug: topic.slug,
        title: topic.title,
        summary: topic.summary,
        kind: topic.kind,
        difficulty: topic.difficulty,
        position: topic.position,
        est_minutes: topic.estMinutes,
        body: topic.body.markdown,
        data: JSON.stringify({
          derivations: topic.body.derivations,
          implementations: topic.body.implementations,
          checkpoints: topic.body.checkpoints,
          visualizers: topic.body.visualizers,
          hints: topic.body.hints,
          problems: topic.body.problems,
        }),
      });

      clearPrereqs.run(topic.id);
    }

    // Prerequisites in a SECOND pass, after every topic row exists.
    //
    // Files are walked in filename order, but a prerequisite can point at any
    // topic in the corpus — `matrix-calculus` requires `vectors-and-geometry`,
    // which sorts after it. Inserting the edge inline therefore violates the
    // foreign key on `prerequisite.prerequisite_id`.
    for (const topic of content.topics) {
      for (const p of topic.prerequisites) addPrereq.run(topic.id, p);
    }
  });
  run();

  // Rebuild the FTS index from the seeded rows.
  const rebuildFts = db.transaction(() => {
    db.exec(`DELETE FROM topic_fts`);
    const insert = db.prepare(
      `INSERT INTO topic_fts (topic_id, title, summary, body) VALUES (?, ?, ?, ?)`,
    );
    for (const t of content.topics) {
      insert.run(t.id, t.title, t.summary, t.body.markdown);
    }
  });
  rebuildFts();

  return {
    tracks: content.tracks.length,
    topics: content.topics.length,
    prerequisites: content.topics.reduce((n, t) => n + t.prerequisites.length, 0),
    errors,
  };
}
