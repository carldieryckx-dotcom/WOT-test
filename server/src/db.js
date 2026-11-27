// SQLite storage (built-in node:sqlite, no native modules to compile).
//
// File: $DATA_DIR/data.sqlite (production: /var/lib/marathon/data.sqlite)
//   kv    – small key/value store; currently only the key `settings`
//   runs  – one row per run; UNIQUE(date, km_x100) skips duplicates on date + distance

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS kv (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  expires_at INTEGER
);
CREATE TABLE IF NOT EXISTS runs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  date       TEXT    NOT NULL,             -- YYYY-MM-DD (local date of the run)
  km_x100    INTEGER NOT NULL,             -- distance in hundredths of a km (10 m)
  duration_s INTEGER NOT NULL,             -- duration in seconds
  avg_hr     INTEGER,                      -- average heart rate (optional)
  name       TEXT,
  notes      TEXT,
  source     TEXT    NOT NULL,             -- manual | bulk | gpx | drx
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (date, km_x100)
);
CREATE INDEX IF NOT EXISTS runs_date ON runs (date);
`;

export function openDb(dataDir) {
  let file = ':memory:';
  if (dataDir !== ':memory:') {
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    file = path.join(dataDir, 'data.sqlite');
  }
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return createStore(db);
}

const toRun = (row) =>
  row && {
    id: Number(row.id),
    date: row.date,
    km: Number(row.km_x100) / 100,
    movingTime: Number(row.duration_s),
    avgHr: row.avg_hr == null ? null : Number(row.avg_hr),
    name: row.name || null,
    notes: row.notes || null,
    source: row.source,
    createdAt: row.created_at,
  };

function createStore(db) {
  const q = {
    kvGet: db.prepare('SELECT value, expires_at FROM kv WHERE key = ?'),
    kvPut: db.prepare('INSERT INTO kv (key, value, expires_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at'),
    kvDel: db.prepare('DELETE FROM kv WHERE key = ?'),
    insert: db.prepare(
      'INSERT INTO runs (date, km_x100, duration_s, avg_hr, name, notes, source) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (date, km_x100) DO NOTHING RETURNING *',
    ),
    byKey: db.prepare('SELECT * FROM runs WHERE date = ? AND km_x100 = ?'),
    list: db.prepare('SELECT * FROM runs WHERE date >= ? ORDER BY date DESC, id DESC'),
    del: db.prepare('DELETE FROM runs WHERE id = ?'),
  };

  /** Inserts one validated run. Returns { run, created }. A duplicate (date + distance) is skipped. */
  function addRun(r) {
    const kmX100 = Math.round(r.km * 100);
    const row = q.insert.get(r.date, kmX100, r.durationS, r.avgHr ?? null, r.name ?? null, r.notes ?? null, r.source);
    if (row) return { run: toRun(row), created: true };
    return { run: toRun(q.byKey.get(r.date, kmX100)), created: false };
  }

  return {
    db,
    getJson(key) {
      const row = q.kvGet.get(key);
      if (!row) return null;
      if (row.expires_at != null && Number(row.expires_at) < Date.now()) {
        q.kvDel.run(key);
        return null;
      }
      return JSON.parse(row.value);
    },
    putJson(key, value, ttlSeconds) {
      q.kvPut.run(key, JSON.stringify(value), ttlSeconds ? Date.now() + ttlSeconds * 1000 : null);
    },
    addRun,
    /** Inserts many runs in one transaction. Returns [{ run, created }] in the same order. */
    addRuns(list) {
      db.exec('BEGIN');
      try {
        const out = list.map(addRun);
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    listRuns(after = '0000-00-00') {
      return q.list.all(after).map(toRun);
    },
    deleteRun(id) {
      return Number(q.del.run(id).changes) > 0;
    },
    close() {
      db.close();
    },
  };
}
