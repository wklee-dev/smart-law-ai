import "server-only";

import {
  openSmartLawDb,
  smartLawTableExists,
  type SmartLawDb,
} from "@/app/lib/smart-law-db";
import {
  TT_CASE_DECISION_TABS,
  TT_CASE_SORT_KEYS,
  type TtCaseDetail,
  type TtCaseListRow,
  type TtCaseQueryParams,
  type TtCaseSortKey,
  type TtCaseTabCounts,
} from "@/app/lib/tt-case-shared";

export type { TtCaseQueryParams } from "@/app/lib/tt-case-shared";
export { TT_CASE_DECISION_TABS } from "@/app/lib/tt-case-shared";

const CASE_TABLE = "tb_tt_case";
const ATTACH_TABLE = "tb_tt_attach";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function escapeLike(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export async function openTtCaseDb(): Promise<SmartLawDb> {
  return openSmartLawDb(true);
}

export async function ttCaseTablesReady(db: SmartLawDb): Promise<boolean> {
  return smartLawTableExists(db, CASE_TABLE);
}

function parseSort(raw?: string): TtCaseSortKey {
  const s = str(raw);
  return (TT_CASE_SORT_KEYS as readonly string[]).includes(s)
    ? (s as TtCaseSortKey)
    : "decision_date";
}

function parseDir(raw?: string): "ASC" | "DESC" {
  return str(raw).toUpperCase() === "ASC" ? "ASC" : "DESC";
}

function buildWhere(params: TtCaseQueryParams): {
  whereSql: string;
  bind: unknown[];
} {
  const clauses: string[] = ["1=1"];
  const bind: unknown[] = [];

  if (params.decisionTab !== "ALL") {
    clauses.push("decision_type = ?");
    bind.push(params.decisionTab);
  }

  const claim = str(params.claimNo);
  if (claim) {
    clauses.push(
      "(IFNULL(claim_no,'') LIKE ? ESCAPE '\\' OR IFNULL(doc_no,'') LIKE ? ESCAPE '\\')",
    );
    const p = `%${escapeLike(claim)}%`;
    bind.push(p, p);
  }

  const title = str(params.title);
  if (title) {
    clauses.push("IFNULL(title,'') LIKE ? ESCAPE '\\'");
    bind.push(`%${escapeLike(title)}%`);
  }

  const law = str(params.relatedLaw);
  if (law) {
    clauses.push("IFNULL(related_law,'') LIKE ? ESCAPE '\\'");
    bind.push(`%${escapeLike(law)}%`);
  }

  const kw = str(params.keyword);
  if (kw) {
    clauses.push(
      `(IFNULL(title,'') LIKE ? ESCAPE '\\'
        OR IFNULL(summary,'') LIKE ? ESCAPE '\\'
        OR IFNULL(order_text,'') LIKE ? ESCAPE '\\'
        OR IFNULL(reason_text,'') LIKE ? ESCAPE '\\'
        OR IFNULL(body_text,'') LIKE ? ESCAPE '\\')`,
    );
    const p = `%${escapeLike(kw)}%`;
    bind.push(p, p, p, p, p);
  }

  const from = str(params.dateFrom);
  if (from) {
    clauses.push("IFNULL(decision_date,'') >= ?");
    bind.push(from);
  }
  const to = str(params.dateTo);
  if (to) {
    clauses.push("IFNULL(decision_date,'') <= ?");
    bind.push(to);
  }

  return { whereSql: clauses.join(" AND "), bind };
}

export async function ttCaseTabCounts(
  db: SmartLawDb,
): Promise<TtCaseTabCounts> {
  const totalRow = await db.get(`SELECT COUNT(*) AS c FROM ${CASE_TABLE}`);
  const counts: TtCaseTabCounts = { 전체: Number(totalRow?.c ?? 0) };
  for (const t of TT_CASE_DECISION_TABS) {
    const r = await db.get(
      `SELECT COUNT(*) AS c FROM ${CASE_TABLE} WHERE decision_type = ?`,
      [t],
    );
    counts[t] = Number(r?.c ?? 0);
  }
  return counts;
}

export async function queryTtCases(
  db: SmartLawDb,
  params: TtCaseQueryParams,
): Promise<{ rows: TtCaseListRow[]; total: number }> {
  if (!(await ttCaseTablesReady(db))) {
    throw new Error("조세심판사례 테이블(tb_tt_case)이 없습니다.");
  }

  const page = Math.max(1, Math.floor(params.page || 1));
  const pageSize = Math.min(100, Math.max(5, Math.floor(params.pageSize || 10)));
  const sort = parseSort(params.sort);
  const dir = parseDir(params.sort_dir);
  const { whereSql, bind } = buildWhere(params);

  const totalRow = await db.get(
    `SELECT COUNT(*) AS c FROM ${CASE_TABLE} WHERE ${whereSql}`,
    bind,
  );
  const total = Number(totalRow?.c ?? 0);
  const offset = (page - 1) * pageSize;

  const rows = (await db.all(
    `SELECT dem_no, doc_no, claim_no, semok_name, decision_type, decision_date,
            title, summary, related_law, attach_cnt, source_url
     FROM ${CASE_TABLE}
     WHERE ${whereSql}
     ORDER BY ${sort} ${dir}, dem_no DESC
     LIMIT ? OFFSET ?`,
    [...bind, pageSize, offset],
  )) as unknown as TtCaseListRow[];

  return { rows, total };
}

export async function getTtCaseDetail(
  db: SmartLawDb,
  demNo: number,
): Promise<TtCaseDetail | null> {
  if (!Number.isFinite(demNo) || demNo <= 0) return null;
  const row = (await db.get(
    `SELECT dem_no, doc_no, claim_no, semok_name, decision_type, decision_date,
            title, summary, related_law, ref_decision, fol_decision,
            order_text, reason_text, body_text, attach_cnt, source_url, crawl_status
     FROM ${CASE_TABLE}
     WHERE dem_no = ?`,
    [demNo],
  )) as Omit<TtCaseDetail, "attachments"> | undefined;
  if (!row) return null;

  let attachments: TtCaseDetail["attachments"] = [];
  try {
    if (await smartLawTableExists(db, ATTACH_TABLE)) {
      attachments = (await db.all(
        `SELECT attach_id, file_name, file_ext, download_url, dem_str
         FROM ${ATTACH_TABLE}
         WHERE dem_no = ?
         ORDER BY attach_id`,
        [demNo],
      )) as unknown as TtCaseDetail["attachments"];
    }
  } catch {
    attachments = [];
  }

  return { ...row, attachments };
}

export async function listTtDecisionTypes(db: SmartLawDb): Promise<string[]> {
  const rows = await db.all(
    `SELECT DISTINCT TRIM(decision_type) AS v FROM ${CASE_TABLE}
     WHERE TRIM(IFNULL(decision_type,'')) != ''
     ORDER BY v`,
  );
  return rows.map((r) => str(r.v));
}
