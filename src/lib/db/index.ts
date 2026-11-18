import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { MIGRATIONS, SCHEMA_VERSION } from "./schema";
import { seedContent } from "./seed";

/**
 * Local-first storage.
 *
 * The database lives in a per-user application-support directory, never inside
 * the (read-only) app bundle. `SIGMA_DATA_DIR` overrides it, which is
 * what the dev server and the test suite use.
 */
export function resolveDataDir(): string {
  const override = process.env.SIGMA_DATA_DIR;
  if (override) return path.resolve(override);

  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "Sigma", "data");
  }
  if (process.platform === "win32") {
    const base = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
    return path.join(base, "Sigma", "data");
  }
  const base = process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share");
  return path.join(base, "sigma", "data");
}

export function resolveDbPath(): string {
  return path.join(resolveDataDir(), "sigma.db");
}

let singleton: Database.Database | null = null;

export function getDb(): Database.Database {
  if (singleton) return singleton;

  const dir = resolveDataDir();
  fs.mkdirSync(dir, { recursive: true });
  const db = new Database(resolveDbPath());

  // WAL keeps reads from blocking the writer; busy_timeout avoids spurious
  // SQLITE_BUSY when the coach writes a message while a poll reads history.
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");

  migrate(db);
  seedContent(db);
  singleton = db;
  return db;
}

export function closeDb(): void {
  singleton?.close();
  singleton = null;
}

/**
 * Runs every migration whose id is greater than the recorded version.
 * Each migration is applied in its own transaction; a failure rolls that
 * migration back and leaves the schema at the last good version.
 */
export function migrate(db: Database.Database): number {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migration (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  const applied = new Set(
    db
      .prepare(`SELECT id FROM schema_migration`)
      .all()
      .map((r) => (r as { id: number }).id),
  );

  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    const run = db.transaction(() => {
      db.exec(m.sql);
      db.prepare(`INSERT INTO schema_migration (id, name) VALUES (?, ?)`).run(m.id, m.name);
    });
    run();
  }
  return currentVersion(db);
}

export function currentVersion(db: Database.Database): number {
  const row = db
    .prepare(`SELECT COALESCE(MAX(id), 0) AS v FROM schema_migration`)
    .get() as { v: number } | undefined;
  return row?.v ?? 0;
}

export function assertSchemaCurrent(): void {
  const db = getDb();
  const v = currentVersion(db);
  if (v !== SCHEMA_VERSION) {
    throw new Error(
      `Database schema is at version ${v}, but this build expects ${SCHEMA_VERSION}. Run \`npm run db:migrate\`.`,
    );
  }
}
