import "server-only";

import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type {
  DualUseHskDetailRow,
  DualUseHskListQuery,
  DualUseHskListRow,
} from "@/app/lib/dual-use-hsk-shared";
import { getSmartLawSqliteDbPath } from "@/app/lib/smart-law-sqlite-paths";

const ITEM_TABLE = "crawl_hsk_control_item";
const DESC_TABLE = "crawl_cntrl_no_desc";
const DETAIL_TABLE = "crawl_hsk_control_detail";
const VIEW_NAME = "vw_crawl_hsk_control";

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function hasObject(db: DatabaseSync, name: string): boolean {
  const row = db
    .prepare(
      `SELECT name FROM sqlite_master
        WHERE type IN ('table','view') AND name = ? LIMIT 1`,
    )
    .get(name) as { name: string } | undefined;
  return Boolean(row?.name);
}

export function dualUseHskTablesReady(db: DatabaseSync): boolean {
  return hasObject(db, ITEM_TABLE);
}

export function openDualUseHskDb(readOnly = true): DatabaseSync {
  const p = getSmartLawSqliteDbPath();
  if (!fs.existsSync(p)) {
    throw new Error(`DB 파일이 없습니다: ${p}`);
  }
  return new DatabaseSync(p, { readOnly });
}

export function countDualUseHskItems(db: DatabaseSync): number {
  if (!hasObject(db, ITEM_TABLE)) return 0;
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM ${ITEM_TABLE}`)
    .get() as { n: number };
  return num(row?.n);
}

export function queryDualUseHskList(
  db: DatabaseSync,
  params: DualUseHskListQuery,
): { rows: DualUseHskListRow[]; total: number } {
  if (!dualUseHskTablesReady(db)) return { rows: [], total: 0 };

  const page = Math.max(1, Math.floor(params.page) || 1);
  const pageSize = Math.min(100, Math.max(5, Math.floor(params.pageSize) || 10));
  const keyword = str(params.keyword);
  const where: string[] = [];
  const bind: unknown[] = [];

  if (keyword) {
    where.push(
      `(i.hsk_cd LIKE ? OR IFNULL(i.cntrl_no,'') LIKE ? OR i.hsk_nm LIKE ? OR IFNULL(i.hsk_eng_nm,'') LIKE ?)`,
    );
    const like = `%${keyword}%`;
    bind.push(like, like, like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const fromSql = `FROM ${ITEM_TABLE} AS i`;

  const total = num(
    (
      db
        .prepare(`SELECT COUNT(*) AS n ${fromSql} ${whereSql}`)
        .get(...bind) as { n: number }
    )?.n,
  );

  const rows = (
    db
      .prepare(
        `SELECT i.hsk_cd, i.hsk_nm, IFNULL(i.hsk_eng_nm,'') AS hsk_eng_nm,
                IFNULL(i.cntrl_no,'') AS cntrl_no,
                i.cntrl_no_lvl,
                IFNULL(i.up_cntrl_no,'') AS up_cntrl_no,
                IFNULL(i.cntrl_stts_cd,'') AS cntrl_stts_cd
           ${fromSql}
          ${whereSql}
          ORDER BY i.hsk_cd ASC, IFNULL(i.sort_cntrl_no, i.cntrl_no) ASC
          LIMIT ? OFFSET ?`,
      )
      .all(...bind, pageSize, (page - 1) * pageSize) as Record<string, unknown>[]
  ).map((r) => ({
    hsk_cd: str(r.hsk_cd),
    hsk_nm: str(r.hsk_nm),
    hsk_eng_nm: str(r.hsk_eng_nm),
    cntrl_no: str(r.cntrl_no),
    cntrl_no_lvl:
      r.cntrl_no_lvl == null || r.cntrl_no_lvl === ""
        ? null
        : num(r.cntrl_no_lvl),
    up_cntrl_no: str(r.up_cntrl_no),
    cntrl_stts_cd: str(r.cntrl_stts_cd),
  }));

  return { rows, total };
}

export function listDualUseHskDetailByHs(
  db: DatabaseSync,
  hskCd: string,
): DualUseHskDetailRow[] {
  const code = str(hskCd);
  if (!code || !dualUseHskTablesReady(db)) return [];

  if (hasObject(db, VIEW_NAME)) {
    return (
      db
        .prepare(
          `SELECT IFNULL(cntrl_no,'') AS cntrl_no,
                  IFNULL(up_cntrl_no,'') AS up_cntrl_no,
                  IFNULL(ko_expl,'') AS ko_expl,
                  IFNULL(en_expl,'') AS en_expl,
                  hsk_cd,
                  IFNULL(hsk_nm,'') AS hsk_nm,
                  IFNULL(hsk_eng_nm,'') AS hsk_eng_nm,
                  '' AS src_url
             FROM ${VIEW_NAME}
            WHERE hsk_cd = ?
            ORDER BY IFNULL(cntrl_no,'')`,
        )
        .all(code) as Record<string, unknown>[]
    ).map((r) => ({
      cntrl_no: str(r.cntrl_no),
      up_cntrl_no: str(r.up_cntrl_no),
      ko_expl: str(r.ko_expl),
      en_expl: str(r.en_expl),
      hsk_cd: str(r.hsk_cd),
      hsk_nm: str(r.hsk_nm),
      hsk_eng_nm: str(r.hsk_eng_nm),
      src_url: str(r.src_url),
    }));
  }

  if (hasObject(db, DETAIL_TABLE)) {
    const detailRows = (
      db
        .prepare(
          `SELECT IFNULL(cntrl_no,'') AS cntrl_no,
                  IFNULL(up_cntrl_no,'') AS up_cntrl_no,
                  IFNULL(ko_expl,'') AS ko_expl,
                  IFNULL(en_expl,'') AS en_expl,
                  hsk_cd,
                  IFNULL(hsk_nm,'') AS hsk_nm,
                  IFNULL(hsk_eng_nm,'') AS hsk_eng_nm,
                  IFNULL(src_url,'') AS src_url
             FROM ${DETAIL_TABLE}
            WHERE hsk_cd = ?
            ORDER BY IFNULL(sort_cntrl_no, cntrl_no)`,
        )
        .all(code) as Record<string, unknown>[]
    ).map((r) => ({
      cntrl_no: str(r.cntrl_no),
      up_cntrl_no: str(r.up_cntrl_no),
      ko_expl: str(r.ko_expl),
      en_expl: str(r.en_expl),
      hsk_cd: str(r.hsk_cd),
      hsk_nm: str(r.hsk_nm),
      hsk_eng_nm: str(r.hsk_eng_nm),
      src_url: str(r.src_url),
    }));
    if (detailRows.length) return detailRows;
  }

  const hasDesc = hasObject(db, DESC_TABLE);
  const sql = hasDesc
    ? `SELECT IFNULL(i.cntrl_no,'') AS cntrl_no,
              IFNULL(i.up_cntrl_no,'') AS up_cntrl_no,
              IFNULL(d.ko_expl,'') AS ko_expl,
              IFNULL(d.en_expl,'') AS en_expl,
              i.hsk_cd,
              IFNULL(i.hsk_nm,'') AS hsk_nm,
              IFNULL(i.hsk_eng_nm,'') AS hsk_eng_nm,
              IFNULL(i.src_url,'') AS src_url
         FROM ${ITEM_TABLE} i
         LEFT JOIN ${DESC_TABLE} d ON d.cntrl_no = i.cntrl_no
        WHERE i.hsk_cd = ?
        ORDER BY IFNULL(i.sort_cntrl_no, i.cntrl_no)`
    : `SELECT IFNULL(cntrl_no,'') AS cntrl_no,
              IFNULL(up_cntrl_no,'') AS up_cntrl_no,
              '' AS ko_expl,
              '' AS en_expl,
              hsk_cd,
              IFNULL(hsk_nm,'') AS hsk_nm,
              IFNULL(hsk_eng_nm,'') AS hsk_eng_nm,
              IFNULL(src_url,'') AS src_url
         FROM ${ITEM_TABLE}
        WHERE hsk_cd = ?
        ORDER BY IFNULL(sort_cntrl_no, cntrl_no)`;

  return (db.prepare(sql).all(code) as Record<string, unknown>[]).map((r) => ({
    cntrl_no: str(r.cntrl_no),
    up_cntrl_no: str(r.up_cntrl_no),
    ko_expl: str(r.ko_expl),
    en_expl: str(r.en_expl),
    hsk_cd: str(r.hsk_cd),
    hsk_nm: str(r.hsk_nm),
    hsk_eng_nm: str(r.hsk_eng_nm),
    src_url: str(r.src_url),
  }));
}
