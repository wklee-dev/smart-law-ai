import "server-only";

import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { getClipQuestionDbPath } from "@/app/lib/clip-question-paths";
import {
  CLIP_QUESTION_AREA_TABS,
  CLIP_QUESTION_SORT_KEYS,
  formatClipQuestionDate,
  type ClipQuestionAreaTab,
  type ClipQuestionDetail,
  type ClipQuestionListRow,
  type ClipQuestionQueryParams,
  type ClipQuestionSortKey,
  type ClipQuestionTabCounts,
} from "@/app/lib/clip-question-shared";

export {
  CLIP_QUESTION_AREA_TABS,
  CLIP_QUESTION_GUBUN_OPTIONS,
  formatClipQuestionDate,
  type ClipQuestionAreaTab,
  type ClipQuestionDetail,
  type ClipQuestionGubun,
  type ClipQuestionListRow,
  type ClipQuestionQueryParams,
  type ClipQuestionSortKey,
  type ClipQuestionTabCounts,
} from "@/app/lib/clip-question-shared";

function stmtAll<T extends Record<string, unknown>>(
  db: DatabaseSync,
  sql: string,
  params: unknown[] = [],
): T[] {
  const st = db.prepare(sql);
  const rows = st.all(...params) as T[];
  return rows ?? [];
}

function stmtGet<T extends Record<string, unknown>>(
  db: DatabaseSync,
  sql: string,
  params: unknown[] = [],
): T | undefined {
  const st = db.prepare(sql);
  return st.get(...params) as T | undefined;
}

export function openClipQuestionDb(): DatabaseSync {
  const p = getClipQuestionDbPath();
  if (!fs.existsSync(p)) {
    throw new Error(`CLIP 질의회신 DB 파일이 없습니다: ${p}`);
  }
  return new DatabaseSync(p);
}

function normalizeSort(sort: string | null | undefined): ClipQuestionSortKey {
  const s = (sort ?? "receive_date").trim();
  return (CLIP_QUESTION_SORT_KEYS as readonly string[]).includes(s)
    ? (s as ClipQuestionSortKey)
    : "receive_date";
}

function normalizeDir(d: string | null | undefined): "asc" | "desc" {
  return d?.trim().toLowerCase() === "asc" ? "asc" : "desc";
}

const SORT_SQL: Record<ClipQuestionSortKey, string> = {
  gubun: `TRIM(IFNULL(gubun, ''))`,
  category: `TRIM(IFNULL(category, ''))`,
  title: `TRIM(IFNULL(title, ''))`,
  receive_date: `TRIM(IFNULL(receive_date, ''))`,
  reply_date: `TRIM(IFNULL(reply_date, ''))`,
  reply_dept: `TRIM(IFNULL(reply_dept, ''))`,
};

/** 업무분야 category → 탭(FTA·통관·심사·조사·공통) */
export function categoryAreaTab(
  category: string | null | undefined,
): ClipQuestionAreaTab | null {
  const c = (category ?? "").trim();
  for (const tab of CLIP_QUESTION_AREA_TABS) {
    if (c === tab || c.startsWith(`${tab} >`) || c.startsWith(`${tab}>`)) {
      return tab;
    }
  }
  return null;
}

function areaTabSql(tab: ClipQuestionAreaTab): string {
  return `(TRIM(IFNULL(category,'')) = ? OR TRIM(IFNULL(category,'')) LIKE ?)`;
}

function areaTabBinds(tab: ClipQuestionAreaTab): [string, string] {
  return [tab, `${tab} >%`];
}

function mapListRow(r: Record<string, unknown>): ClipQuestionListRow {
  return {
    seq_id: String(r.seq_id ?? ""),
    gubun: String(r.gubun ?? ""),
    category: String(r.category ?? ""),
    title: String(r.title ?? ""),
    receive_date: formatClipQuestionDate(
      r.receive_date as string | null | undefined,
    ),
    reply_date: formatClipQuestionDate(
      r.reply_date as string | null | undefined,
    ),
    reply_dept: String(r.reply_dept ?? ""),
  };
}

export function clipQuestionTabCounts(db: DatabaseSync): ClipQuestionTabCounts {
  const rows = stmtAll<{ category: string | null }>(
    db,
    `SELECT category FROM clip_question`,
  );
  const out: ClipQuestionTabCounts = {
    전체: 0,
    FTA: 0,
    통관: 0,
    심사: 0,
    조사: 0,
    공통: 0,
  };
  for (const r of rows) {
    out.전체 += 1;
    const tab = categoryAreaTab(r.category);
    if (tab) out[tab] += 1;
  }
  return out;
}

export function clipQuestionDistinctGubun(db: DatabaseSync): string[] {
  return stmtAll<{ v: string }>(
    db,
    `SELECT DISTINCT TRIM(gubun) AS v FROM clip_question
     WHERE gubun IS NOT NULL AND TRIM(gubun) <> ''
     ORDER BY v COLLATE NOCASE`,
  ).map((r) => r.v);
}

export function queryClipQuestions(
  db: DatabaseSync,
  p: ClipQuestionQueryParams,
): { rows: ClipQuestionListRow[]; total: number } {
  const page = Math.max(1, Math.floor(p.page));
  const pageSize = Math.min(100, Math.max(5, Math.floor(p.pageSize)));
  const offset = (page - 1) * pageSize;

  const binds: unknown[] = [];
  const parts: string[] = ["1=1"];

  const tab = (p.areaTab ?? "ALL").trim();
  if (tab && tab !== "ALL") {
    if ((CLIP_QUESTION_AREA_TABS as readonly string[]).includes(tab)) {
      parts.push(areaTabSql(tab as ClipQuestionAreaTab));
      binds.push(...areaTabBinds(tab as ClipQuestionAreaTab));
    }
  }

  const gubun = (p.gubun ?? "").trim();
  if (gubun !== "") {
    parts.push(`TRIM(IFNULL(gubun, '')) = ?`);
    binds.push(gubun);
  }

  const title = (p.title ?? "").trim();
  if (title !== "") {
    parts.push(`title LIKE ? COLLATE NOCASE`);
    binds.push(`%${title}%`);
  }

  const whereSql = parts.join(" AND ");
  const totalRow = stmtGet<{ n: number }>(
    db,
    `SELECT COUNT(*) AS n FROM clip_question WHERE ${whereSql}`,
    binds,
  );
  const total = Math.max(0, Number(totalRow?.n ?? 0));

  const sortCol = normalizeSort(p.sort);
  const sortAsc = normalizeDir(p.sort_dir) === "asc";
  const orderExpr = SORT_SQL[sortCol];
  const orderDir = sortAsc ? "ASC" : "DESC";

  const rows = stmtAll<Record<string, unknown>>(
    db,
    `SELECT seq_id, gubun, category, title, receive_date, reply_date, reply_dept
     FROM clip_question
     WHERE ${whereSql}
     ORDER BY ${orderExpr} ${orderDir}, TRIM(IFNULL(seq_id,'')) ASC
     LIMIT ? OFFSET ?`,
    [...binds, pageSize, offset],
  ).map(mapListRow);

  return { rows, total };
}

export function getClipQuestionDetail(
  db: DatabaseSync,
  seqId: string,
): ClipQuestionDetail | null {
  const key = seqId.trim();
  if (!key) return null;

  const row = stmtGet<Record<string, unknown>>(
    db,
    `SELECT
       seq_id, gubun, category, title,
       receive_date, reply_date, reply_dept,
       question_summary, law_target, law_basis,
       detail_content, reply_content
     FROM clip_question
     WHERE seq_id = ?`,
    [key],
  );
  if (!row) return null;

  const base = mapListRow(row);
  return {
    ...base,
    question_summary: String(row.question_summary ?? "").trim(),
    law_target: String(row.law_target ?? "").trim(),
    law_basis: String(row.law_basis ?? "").trim(),
    detail_content: String(row.detail_content ?? "").trim(),
    reply_content: String(row.reply_content ?? "").trim(),
  };
}
