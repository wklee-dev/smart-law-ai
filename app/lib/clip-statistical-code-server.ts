import "server-only";

import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  type ClipStatisticalCodeCategoryQueryParams,
  type ClipStatisticalCodeCategoryRow,
  type ClipStatisticalCodeDetailQueryParams,
  type ClipStatisticalCodeDetailRow,
} from "@/app/lib/clip-statistical-code-shared";
import { getSmartLawSqliteDbPath } from "@/app/lib/smart-law-sqlite-paths";

export {
  type ClipStatisticalCodeCategoryQueryParams,
  type ClipStatisticalCodeCategoryRow,
  type ClipStatisticalCodeDetailQueryParams,
  type ClipStatisticalCodeDetailRow,
} from "@/app/lib/clip-statistical-code-shared";

export const DEFAULT_CLIP_STATISTICAL_CODE_EXCEL =
  "C:/SQLiteDB/excel/유니패스_통계부호_20260912T024700Z-89f0d014.xlsx";

const CAT_TABLE = "clip_statistical_code";
const DET_TABLE = "clip_statistical_code_detail";

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function hasTable(db: DatabaseSync, name: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(name) as { name: string } | undefined;
  return Boolean(row?.name);
}

export function clipStatisticalCodeTablesReady(db: DatabaseSync): boolean {
  return hasTable(db, CAT_TABLE) && hasTable(db, DET_TABLE);
}

export function openClipStatisticalCodeDb(readOnly = true): DatabaseSync {
  const p = getSmartLawSqliteDbPath();
  if (!fs.existsSync(p)) {
    throw new Error(`DB 파일이 없습니다: ${p}`);
  }
  return new DatabaseSync(p, { readOnly });
}

export function countClipStatisticalCodeCategories(db: DatabaseSync): number {
  if (!hasTable(db, CAT_TABLE)) return 0;
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM ${CAT_TABLE}`)
    .get() as { n: number };
  return num(row?.n);
}

export function queryClipStatisticalCodeCategories(
  db: DatabaseSync,
  params: ClipStatisticalCodeCategoryQueryParams,
): { rows: ClipStatisticalCodeCategoryRow[]; total: number } {
  if (!clipStatisticalCodeTablesReady(db)) {
    return { rows: [], total: 0 };
  }

  const page = Math.max(1, Math.floor(params.page) || 1);
  const pageSize = Math.min(100, Math.max(5, Math.floor(params.pageSize) || 10));
  const keyword = str(params.keyword);

  const where: string[] = [];
  const bind: unknown[] = [];
  if (keyword) {
    where.push("(stat_name LIKE ? OR stat_code LIKE ? OR stat_sign LIKE ?)");
    const like = `%${keyword}%`;
    bind.push(like, like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS n FROM ${CAT_TABLE} ${whereSql}`)
    .get(...bind) as { n: number };
  const total = num(totalRow?.n);

  const rows = db
    .prepare(
      `SELECT stat_code, stat_sign, stat_name, source_seq
       FROM ${CAT_TABLE}
       ${whereSql}
       ORDER BY stat_name ASC, stat_code ASC
       LIMIT ? OFFSET ?`,
    )
    .all(...bind, pageSize, (page - 1) * pageSize)
    .map((row) => {
      const r = row as Record<string, unknown>;
      return {
        stat_code: str(r.stat_code),
        stat_sign: str(r.stat_sign),
        stat_name: str(r.stat_name),
        source_seq: num(r.source_seq),
      };
    });

  return { rows, total };
}

export function getClipStatisticalCodeCategory(
  db: DatabaseSync,
  statCode: string,
): ClipStatisticalCodeCategoryRow | null {
  if (!hasTable(db, CAT_TABLE)) return null;
  const code = str(statCode);
  if (!code) return null;
  const row = db
    .prepare(
      `SELECT stat_code, stat_sign, stat_name, source_seq FROM ${CAT_TABLE} WHERE stat_code = ?`,
    )
    .get(code) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    stat_code: str(row.stat_code),
    stat_sign: str(row.stat_sign),
    stat_name: str(row.stat_name),
    source_seq: num(row.source_seq),
  };
}

export function queryClipStatisticalCodeDetails(
  db: DatabaseSync,
  params: ClipStatisticalCodeDetailQueryParams,
): { rows: ClipStatisticalCodeDetailRow[]; total: number } {
  if (!clipStatisticalCodeTablesReady(db)) {
    return { rows: [], total: 0 };
  }

  const statCode = str(params.statCode);
  if (!statCode) {
    return { rows: [], total: 0 };
  }

  const page = Math.max(1, Math.floor(params.page) || 1);
  const pageSize = Math.min(
    500,
    Math.max(5, Math.floor(params.pageSize) || 10),
  );
  const keyword = str(params.keyword);

  const where: string[] = ["stat_code = ?"];
  const bind: unknown[] = [statCode];
  if (keyword) {
    where.push(
      "(detail_code LIKE ? OR name_kr LIKE ? OR abbr_kr LIKE ? OR abbr_en LIKE ? OR name_en LIKE ?)",
    );
    const like = `%${keyword}%`;
    bind.push(like, like, like, like, like);
  }
  const whereSql = `WHERE ${where.join(" AND ")}`;

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS n FROM ${DET_TABLE} ${whereSql}`)
    .get(...bind) as { n: number };
  const total = num(totalRow?.n);

  const rows = db
    .prepare(
      `SELECT detail_code, name_kr, abbr_kr, abbr_en, name_en
       FROM ${DET_TABLE}
       ${whereSql}
       ORDER BY source_seq ASC, detail_code ASC
       LIMIT ? OFFSET ?`,
    )
    .all(...bind, pageSize, (page - 1) * pageSize)
    .map((row) => {
      const r = row as Record<string, unknown>;
      return {
        detail_code: str(r.detail_code),
        name_kr: str(r.name_kr),
        abbr_kr: str(r.abbr_kr),
        abbr_en: str(r.abbr_en),
        name_en: str(r.name_en),
      };
    });

  return { rows, total };
}
