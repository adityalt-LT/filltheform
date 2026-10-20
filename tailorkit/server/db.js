import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDb(path = 'data/tailorkit.db') {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, salt TEXT NOT NULL, pass_hash TEXT NOT NULL,
      plan TEXT NOT NULL DEFAULT 'free', created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS profiles (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      resume TEXT NOT NULL, original_text TEXT NOT NULL DEFAULT '', source_format TEXT NOT NULL DEFAULT '',
      facts TEXT NOT NULL DEFAULT '{}', confirmed_skills TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT '', company TEXT NOT NULL DEFAULT '', location TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '', jd_text TEXT NOT NULL DEFAULT '',
      requirements TEXT NOT NULL DEFAULT '{}', match TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'saved', notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), applied_at TEXT
    );
    CREATE INDEX IF NOT EXISTS jobs_user ON jobs(user_id, created_at);
    CREATE TABLE IF NOT EXISTS resumes (
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE, label TEXT NOT NULL DEFAULT '',
      data TEXT NOT NULL, changes TEXT NOT NULL DEFAULT '[]', suggestions TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS resumes_user ON resumes(user_id, created_at);
    -- One row per job per month: re-tailoring the same job is free, deleting a job does not refund the quota.
    CREATE TABLE IF NOT EXISTS usage (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, month TEXT NOT NULL, job_key TEXT NOT NULL,
      PRIMARY KEY (user_id, month, job_key)
    );
  `);
  return db;
}
