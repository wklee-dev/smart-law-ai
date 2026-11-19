import "server-only";

import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { getClipAdminRuleDbPath } from "@/app/lib/clip-admin-rule-paths";
import {
  CLIP_ADMIN_RULE_SORT_KEYS,
  CLIP_RULE_TYPE_TABS,
  type ClipAdminRuleDetail,
  type ClipAdminRuleListRow,
  type ClipAdminRuleQueryParams,
  type ClipAdminRuleSortKey,
  type ClipRuleTypeTab,
  type ClipTabCounts,
} from "@/app/lib/clip-admin-rule-shared";

export {
  CLIP_RULE_TYPE_TABS,
  type ClipAdminRuleDetail,
  type ClipAdminRuleListRow,
  type ClipAdminRuleQueryParams,
  type ClipAdminRuleSortKey,
  type ClipRuleTypeTab,
  type ClipTabCounts,
} from "@/app/lib/clip-admin-rule-shared";

export { formatClipIssueDate } from "@/app/lib/clip-admin-rule-shared";

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

export function openClipAdminRuleDb(): DatabaseSync {
  const p = getClipAdminRuleDbPath();
  if (!fs.existsSync(p)) {
    throw new Error(`CLIP 행정규칙 DB 파일이 없습니다: ${p}`);
  }
  return new DatabaseSync(p);
}

function normalizeSort(
  sort: string | null | undefined,
): ClipAdminRuleSortKey {
  const s = (sort ?? "issue_date").trim();
  return (CLIP_ADMIN_RULE_SORT_KEYS as readonly string[]).includes(s)
    ? (s as ClipAdminRuleSortKey)
    : "issue_date";
}

function normalizeDir(d: string | null | undefined): "asc" | "desc" {
  return d?.trim().toLowerCase() === "asc" ? "asc" : "desc";
}

function abolishedSqlCondition(includeAbolished: boolean): string {
  if (includeAbolished) return "1 = 1";
  /* 제목·개정유형에 '폐지' 포함 시 목록 제외 — 폐지규칙 포함 체크 시 표시 */
  return `(
    (revision_type IS NULL OR instr(revision_type, '폐지') = 0)
    AND (rule_name IS NULL OR instr(rule_name, '폐지') = 0)
  )`;
}

/** 행정규칙일련번호(lworAdmnRulNo)당 최신 발령 1건만 — 개정 이력 중복 제거 */
const LATEST_ADMIN_RULE_FROM = `
  FROM (
    SELECT
      rule_id, rule_name, rule_type, dept_name, manager_name,
      issue_no, issue_date, revision_type,
      ROW_NUMBER() OVER (
        PARTITION BY
          CASE
            WHEN lworAdmnRulNo IS NOT NULL AND TRIM(lworAdmnRulNo) <> ''
            THEN 'lwor:' || TRIM(lworAdmnRulNo)
            ELSE 'name:' || TRIM(IFNULL(rule_name, ''))
          END
        ORDER BY TRIM(IFNULL(issue_date, '')) DESC,
                 TRIM(IFNULL(issue_no, '')) DESC
      ) AS _rn
    FROM clip_ar_rule
  ) latest_admin_rule
  WHERE latest_admin_rule._rn = 1
`;

/** 탭별 전체 건수 — 검색·부서 필터와 무관(포털 상단 카운트) */
export function clipAdminRuleTabCounts(db: DatabaseSync): ClipTabCounts {
  const rows = stmtAll<{ rule_type: string | null; c: number }>(
    db,
    `SELECT TRIM(IFNULL(rule_type, '')) AS rule_type, COUNT(*) AS c
     ${LATEST_ADMIN_RULE_FROM}
     GROUP BY TRIM(IFNULL(rule_type, ''))`,
  );
  const out: ClipTabCounts = {
    전체: 0,
    고시: 0,
    훈령: 0,
    예규: 0,
    공고: 0,
  };
  for (const r of rows) {
    const rt = r.rule_type ?? "";
    const c = Number(r.c) || 0;
    out.전체 += c;
    if (rt === "고시") out.고시 = c;
    else if (rt === "훈령") out.훈령 = c;
    else if (rt === "예규") out.예규 = c;
    else if (rt === "공고") out.공고 = c;
  }
  return out;
}

export function clipAdminRuleDistinctFilters(db: DatabaseSync): {
  dept_names: string[];
  manager_names: string[];
} {
  const dept_names = stmtAll<{ v: string }>(
    db,
    `SELECT DISTINCT TRIM(dept_name) AS v
     ${LATEST_ADMIN_RULE_FROM}
       AND dept_name IS NOT NULL AND TRIM(dept_name) <> ''
     ORDER BY v COLLATE NOCASE`,
  ).map((r) => r.v);
  const manager_names = stmtAll<{ v: string }>(
    db,
    `SELECT DISTINCT TRIM(manager_name) AS v
     ${LATEST_ADMIN_RULE_FROM}
       AND manager_name IS NOT NULL AND TRIM(manager_name) <> ''
     ORDER BY v COLLATE NOCASE`,
  ).map((r) => r.v);
  return { dept_names, manager_names };
}

export function queryClipAdminRules(
  db: DatabaseSync,
  p: ClipAdminRuleQueryParams,
): { rows: ClipAdminRuleListRow[]; total: number } {
  const page = Math.max(1, Math.floor(p.page));
  const pageSize = Math.min(100, Math.max(5, Math.floor(p.pageSize)));
  const offset = (page - 1) * pageSize;

  const binds: unknown[] = [];
  const parts: string[] = ["1=1"];

  parts.push(abolishedSqlCondition(p.include_abolished));

  const tab = (p.ruleTypeTab ?? "ALL").trim();
  if (tab && tab !== "ALL") {
    if ((CLIP_RULE_TYPE_TABS as readonly string[]).includes(tab)) {
      parts.push(`TRIM(IFNULL(rule_type, '')) = ?`);
      binds.push(tab);
    }
  }

  const rn = (p.rule_name ?? "").trim();
  if (rn !== "") {
    parts.push(`rule_name LIKE ? COLLATE NOCASE`);
    binds.push(`%${rn}%`);
  }

  const dn = (p.dept_name ?? "").trim();
  if (dn !== "") {
    parts.push(`TRIM(IFNULL(dept_name, '')) = ?`);
    binds.push(dn);
  }

  const mn = (p.manager_name ?? "").trim();
  if (mn !== "") {
    parts.push(`TRIM(IFNULL(manager_name, '')) = ?`);
    binds.push(mn);
  }

  const whereSql = parts.join(" AND ");
  const totalRow = stmtGet<{ n: number }>(
    db,
    `SELECT COUNT(*) AS n ${LATEST_ADMIN_RULE_FROM} AND ${whereSql}`,
    binds,
  );
  const total = Math.max(0, Number(totalRow?.n ?? 0));

  const sortCol = normalizeSort(p.sort);
  const sortAsc = normalizeDir(p.sort_dir) === "asc";

  /** YYYYMMDD 문자열을 가정한 사전순 정렬 */
  const orderExpr = `TRIM(IFNULL(latest_admin_rule."${sortCol}",''))`;

  const rows = stmtAll<Record<string, unknown>>(
    db,
    `SELECT
       latest_admin_rule.rule_id, latest_admin_rule.rule_name,
       latest_admin_rule.rule_type, latest_admin_rule.dept_name,
       latest_admin_rule.manager_name, latest_admin_rule.issue_no,
       latest_admin_rule.issue_date, latest_admin_rule.revision_type
     ${LATEST_ADMIN_RULE_FROM}
       AND ${whereSql}
     ORDER BY ${orderExpr} ${sortAsc ? "ASC" : "DESC"}
     LIMIT ? OFFSET ?`,
    [...binds, pageSize, offset],
  );

  const normalized: ClipAdminRuleListRow[] = rows.map((r) => ({
    rule_id: String(r.rule_id ?? ""),
    rule_name: String(r.rule_name ?? ""),
    rule_type: String(r.rule_type ?? ""),
    dept_name: String(r.dept_name ?? ""),
    manager_name: String(r.manager_name ?? ""),
    issue_no: String(r.issue_no ?? ""),
    issue_date: String(r.issue_date ?? ""),
    revision_type: String(r.revision_type ?? ""),
  }));

  return { rows: normalized, total };
}

export function getClipAdminRuleDetail(
  db: DatabaseSync,
  ruleId: string,
): ClipAdminRuleDetail | null {
  const id = ruleId.trim();
  if (!id) return null;

  const row = stmtGet<Record<string, unknown>>(
    db,
    `SELECT rule_id, rule_name, rule_type, dept_name, manager_name,
            issue_no, issue_date, revision_type,
            lworAdmnRulNo, pmgtDtTpNo, content, gubun
       FROM clip_ar_rule
      WHERE rule_id = ?
      LIMIT 1`,
    [id],
  );
  if (!row) return null;

  let histRows: Record<string, unknown>[] = [];
  try {
    histRows = stmtAll<Record<string, unknown>>(
      db,
      `SELECT history_id, rule_id, rule_name, issue_no, revision_date, revision_status
       FROM clip_ar_history
       WHERE rule_id = ?
       ORDER BY TRIM(IFNULL(revision_date,'')) DESC`,
      [id],
    );
  } catch {
    histRows = [];
  }
  const hist = histRows.map((h) => ({
    history_id: String(h.history_id ?? ""),
    rule_id: String(h.rule_id ?? ""),
    rule_name: String(h.rule_name ?? ""),
    issue_no: String(h.issue_no ?? ""),
    revision_date: String(h.revision_date ?? ""),
    revision_status: String(h.revision_status ?? ""),
  }));

  return {
    rule_id: String(row.rule_id ?? ""),
    rule_name: String(row.rule_name ?? ""),
    rule_type: String(row.rule_type ?? ""),
    dept_name: String(row.dept_name ?? ""),
    manager_name: String(row.manager_name ?? ""),
    issue_no: String(row.issue_no ?? ""),
    issue_date: String(row.issue_date ?? ""),
    revision_type: String(row.revision_type ?? ""),
    lworAdmnRulNo: row.lworAdmnRulNo != null ? String(row.lworAdmnRulNo) : null,
    pmgtDtTpNo: row.pmgtDtTpNo != null ? String(row.pmgtDtTpNo) : null,
    content: typeof row.content === "string" ? row.content : String(row.content ?? ""),
    gubun: row.gubun != null ? String(row.gubun) : null,
    history: hist,
  };
}
