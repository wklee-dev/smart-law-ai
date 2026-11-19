import "server-only";

import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  type KitaStrategicMaterialDetailRow,
  type KitaStrategicMaterialListQuery,
  type KitaStrategicMaterialListRow,
} from "@/app/lib/kita-strategic-material-shared";
import { getSmartLawSqliteDbPath } from "@/app/lib/smart-law-sqlite-paths";

const MAP_TABLE = "kita_strategic_material_mapping";
const HS_TABLE = "kita_strategic_material_hs";

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

export function kitaStrategicMaterialTablesReady(db: DatabaseSync): boolean {
  return hasTable(db, MAP_TABLE) && hasTable(db, HS_TABLE);
}

export function openKitaStrategicMaterialDb(readOnly = true): DatabaseSync {
  const p = getSmartLawSqliteDbPath();
  if (!fs.existsSync(p)) {
    throw new Error(`DB 파일이 없습니다: ${p}`);
  }
  return new DatabaseSync(p, { readOnly });
}

export function countKitaStrategicMaterialMappings(db: DatabaseSync): number {
  if (!hasTable(db, MAP_TABLE)) return 0;
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM ${MAP_TABLE}`)
    .get() as { n: number };
  return num(row?.n);
}

export function queryKitaStrategicMaterialList(
  db: DatabaseSync,
  params: KitaStrategicMaterialListQuery,
): { rows: KitaStrategicMaterialListRow[]; total: number } {
  if (!kitaStrategicMaterialTablesReady(db)) {
    return { rows: [], total: 0 };
  }

  const page = Math.max(1, Math.floor(params.page) || 1);
  const pageSize = Math.min(100, Math.max(5, Math.floor(params.pageSize) || 10));
  const keyword = str(params.keyword);
  const where: string[] = [];
  const bind: unknown[] = [];

  if (keyword) {
    where.push(
      `(m.hs_code LIKE ? OR m.control_no LIKE ? OR h.hs_name_ko LIKE ? OR h.hs_name_en LIKE ?)`,
    );
    const like = `%${keyword}%`;
    bind.push(like, like, like, like);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const fromSql = `
    FROM ${MAP_TABLE} AS m
    LEFT JOIN ${HS_TABLE} AS h ON h.hs_code = m.hs_code
  `;

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS n ${fromSql} ${whereSql}`)
    .get(...bind) as { n: number };
  const total = num(totalRow?.n);

  const rows = db
    .prepare(
      `SELECT m.hs_code, m.control_no,
              COALESCE(h.hs_name_ko, '') AS hs_name_ko,
              COALESCE(h.hs_name_en, '') AS hs_name_en
       ${fromSql}
       ${whereSql}
       ORDER BY m.hs_code ASC, m.control_no ASC
       LIMIT ? OFFSET ?`,
    )
    .all(...bind, pageSize, (page - 1) * pageSize)
    .map((row) => {
      const r = row as Record<string, unknown>;
      return {
        hs_code: str(r.hs_code),
        control_no: str(r.control_no),
        hs_name_ko: str(r.hs_name_ko),
        hs_name_en: str(r.hs_name_en),
      };
    });

  return { rows, total };
}

export function listKitaStrategicMaterialByHs(
  db: DatabaseSync,
  hsCode: string,
): KitaStrategicMaterialDetailRow[] {
  if (!hasTable(db, MAP_TABLE)) return [];
  const code = str(hsCode);
  if (!code) return [];

  return db
    .prepare(
      `SELECT control_no, content_ko, content_en, source_url
       FROM ${MAP_TABLE}
       WHERE hs_code = ?
       ORDER BY control_no ASC`,
    )
    .all(code)
    .map((row) => {
      const r = row as Record<string, unknown>;
      return {
        control_no: str(r.control_no),
        content_ko: str(r.content_ko),
        content_en: str(r.content_en),
        source_url: str(r.source_url),
      };
    });
}
