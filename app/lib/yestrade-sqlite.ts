import "server-only";

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  getSmartLawAttachRoot,
  isSmartLawPostgres,
  openSmartLawDb,
  smartLawTableExists,
  type SmartLawDb,
} from "@/app/lib/smart-law-db";
import { getSmartLawSqliteDbPath } from "@/app/lib/smart-law-sqlite-paths";

export type { SmartLawDb };

/**
 * sync SQLite 전용(미이관 화면).
 * Postgres 모드여도 로컬 smart_law_ai.db 가 있으면 그걸로 읽음.
 */
export function openYestradeDb(readOnly = true): DatabaseSync {
  const p = getSmartLawSqliteDbPath();
  if (!fs.existsSync(p)) {
    if (isSmartLawPostgres()) {
      throw new Error(
        `이 화면은 아직 Postgres 미이관입니다. C:/SQLiteDB/smart_law_ai.db 가 없거나 재배포가 필요합니다. (${p})`,
      );
    }
    throw new Error(`DB 파일이 없습니다: ${p}`);
  }
  return new DatabaseSync(p, { readOnly });
}

export async function openYestradeDbAsync(
  readOnly = true,
): Promise<SmartLawDb> {
  return openSmartLawDb(readOnly);
}

export function yestradeHasTable(db: DatabaseSync, name: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(name) as { name: string } | undefined;
  return Boolean(row?.name);
}

export async function yestradeHasTableAsync(
  db: SmartLawDb,
  name: string,
): Promise<boolean> {
  return smartLawTableExists(db, name);
}

export function yestradeStr(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

export function yestradeNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * DB에 남은 D:/SQLiteDB|C:/SQLiteDB 절대경로 → 현재 첨부 루트 아래로 재매핑.
 * RPA-03 첨부 루트는 C:\SQLiteDB.
 */
function mapLegacySqliteDbPath(localPath: string, root: string): string {
  const raw = localPath.trim();
  const legacy = /^[A-Za-z]:[\\/]+SQLiteDB[\\/]*/i;
  if (legacy.test(raw)) {
    const rest = raw.replace(legacy, "");
    return path.resolve(root, rest);
  }
  return path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(root, raw);
}

/** 첨부·이미지 local_path — 첨부 루트(및 하위)만 허용 */
export function resolveYestradeLocalFile(localPath: string): string {
  const raw = localPath.trim();
  if (!raw) throw new Error("경로 없음");
  const root = getSmartLawAttachRoot();
  const abs = mapLegacySqliteDbPath(raw, root);
  const rel = path.relative(root, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("경로 거부");
  }
  return abs;
}

export function guessYestradeContentType(fileName: string): string {
  const n = fileName.toLowerCase();
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".gif")) return "image/gif";
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".zip")) return "application/zip";
  if (n.endsWith(".hwp")) return "application/x-hwp";
  if (n.endsWith(".hwpx")) return "application/hwpx";
  return "application/octet-stream";
}
