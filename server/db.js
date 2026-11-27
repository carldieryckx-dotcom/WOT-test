// SQLite storage for the marathon app (node:sqlite, built into Node 22.13+).
//
// Tables
//   kv    small key/value store (settings)
//   runs  logged runs; duplicates (same date + distance, rounded to 0.1 km) are skipped

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export function openDb(dataDir) {
  let file = ':memory:';
  if (dataDir !== ':memory:') {
    mkdirSync(dataDir, { recursive: true });
    file = join(dataDir, 'data.sqlite');
  }
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS kv (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS runs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      date        TEXT    NOT NULL,
      km          REAL    NOT NULL,
      duration_s  INTEGER NOT NULL,
      avg_hr      INTEGER,
      name        TEXT,
      notes       TEXT,
      source      TEXT    NOT NULL,
      dedupe_key  TEXT    NOT NULL UNIQUE,
      created_at  TEXT    NOT NULL
    );
    CREATE INDEX IF NOT EXISTS runs_date ON runs (date);
  `);
  return new Store(db);
}

/** Same date and the same distance to 100 m counts as the same run. */
export const dedupeKey = (date, km) => `${date}|${Math.round(km * 10)}`;

const toRun = (r) => ({
  id: r.id,
  date: r.date,
  km: r.km,
  movingTime: r.duration_s,
  avgHr: r.avg_hr ?? null,
  name: r.name || '',
  notes: r.notes || '',
  source: r.source,
});

class Store {
  constructor(db) {
    this.db = db;
    this.q = {
      kvGet: db.prepare('SELECT value FROM kv WHERE key = ?'),
      kvSet: db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
      insert: db.prepare(`INSERT INTO runs (date, km, duration_s, avg_hr, name, notes, source, dedupe_key, created_at)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(dedupe_key) DO NOTHING`),
      byKey: db.prepare('SELECT * FROM runs WHERE dedupe_key = ?'),
      list: db.prepare('SELECT * FROM runs WHERE date >= ? ORDER BY date DESC, id DESC'),
      del: db.prepare('DELETE FROM runs WHERE id = ?'),
    };
  }

  getJson(key) {
    const row = this.q.kvGet.get(key);
    return row ? JSON.parse(row.value) : null;
  }

  setJson(key, value) {
    this.q.kvSet.run(key, JSON.stringify(value));
  }

  /** Inserts a validated run. Returns { run, duplicate }. */
  addRun(run) {
    const key = dedupeKey(run.date, run.km);
    const info = this.q.insert.run(
      run.date, run.km, run.movingTime, run.avgHr ?? null, run.name || null, run.notes || null,
      run.source, key, new Date().toISOString(),
    );
    return { run: toRun(this.q.byKey.get(key)), duplicate: info.changes === 0 };
  }

  /** Inserts many runs in one transaction. Returns { added, skipped }. */
  addRuns(runs) {
    const added = [];
    const skipped = [];
    this.db.exec('BEGIN');
    try {
      for (const r of runs) {
        const res = this.addRun(r);
        (res.duplicate ? skipped : added).push(res.run);
      }
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    return { added, skipped };
  }

  listRuns(after = '0000-00-00') {
    return this.q.list.all(after).map(toRun);
  }

  deleteRun(id) {
    return this.q.del.run(id).changes > 0;
  }

  close() {
    this.db.close();
  }
}
