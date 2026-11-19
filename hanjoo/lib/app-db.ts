import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { getSmartLawAttachRoot } from "@/hanjoo/lib/smart-law-db";

/** 로그인·메뉴 접속 기록용 쓰기 가능 DB (법령 DB와 분리 — Postgres 전환 범위 밖). */
export function appDbPath(): string {
  const configured = process.env.APP_DB_PATH?.trim();
  if (configured) return configured;
  return path.join(getSmartLawAttachRoot(), "smart_law_app.db");
}

let schemaReady = false;

function ensureSchema(db: DatabaseSync) {
  if (schemaReady) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS login_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL DEFAULT '',
      success INTEGER NOT NULL DEFAULT 0,
      via TEXT NOT NULL DEFAULT '',
      reason TEXT NOT NULL DEFAULT '',
      ip TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_login_history_created ON login_history(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_login_history_user ON login_history(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS menu_access_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL DEFAULT '',
      menu_label TEXT NOT NULL DEFAULT '',
      menu_path TEXT NOT NULL DEFAULT '',
      href TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'menu',
      ip TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_menu_access_created ON menu_access_history(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_menu_access_user ON menu_access_history(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_menu_access_path ON menu_access_history(menu_path, created_at DESC);
  `);
  schemaReady = true;
}

export function openAppDb(): DatabaseSync {
  const p = appDbPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const db = new DatabaseSync(p);
  ensureSchema(db);
  return db;
}

export function withAppDb<T>(fn: (db: DatabaseSync) => T): T {
  const db = openAppDb();
  try {
    return fn(db);
  } finally {
    db.close();
  }
}
