/**
 * openlaw_* 테이블 전용 조회 (law_* 스키마와 무관).
 * Python law_crawler.py / db_init.py 스키마를 그대로 읽는다.
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  AdminRulesCrawlTarget,
  AdminRulesCrawlTargetMeta,
} from "@/app/lib/admin-rules-crawl-targets-server";
import {
  getLawStatuteCrawlTargets,
  normalizeCrawlTargetRuleName,
} from "@/app/lib/admin-rules-crawl-targets-server";
import { getSmartLawSqliteDbPath } from "@/app/lib/smart-law-sqlite-paths";
import { normalizeLawIdForStorage } from "@/app/shared/law-id";

function openDb(): DatabaseSync {
  const p = path.resolve(
    (process.env.LAW_DB_PATH?.trim() || getSmartLawSqliteDbPath()).trim(),
  );
  if (!fs.existsSync(p)) {
    throw new Error(`법령 SQLite DB 파일이 없습니다: ${p}`);
  }
  return new DatabaseSync(p, { readOnly: true });
}

function tableExists(db: DatabaseSync, name: string): boolean {
  const row = db
    .prepare(
      `SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`,
    )
    .get(name) as { ok?: number } | undefined;
  return Boolean(row?.ok);
}

function stmtAll<T extends Record<string, unknown>>(
  db: DatabaseSync,
  sql: string,
  params: unknown[] = [],
): T[] {
  return (db.prepare(sql).all(...params) as T[]) ?? [];
}

/** jo_no 가 TEXT 라 '1','10','2' 문자열 정렬이 됨 → 제1조·제2조… 자연 순서 */
function parseJoNoParts(joNo: string): [number, number] {
  const m = /^(\d+)(?:-(\d+))?$/.exec(String(joNo ?? "").trim());
  if (!m) return [Number.MAX_SAFE_INTEGER, 0];
  return [Number(m[1]), Number(m[2] ?? 0)];
}

function compareJoNo(a: string, b: string): number {
  const [am, ab] = parseJoNoParts(a);
  const [bm, bb] = parseJoNoParts(b);
  if (am !== bm) return am - bm;
  return ab - bb;
}

function sortByJoNoNatural<T extends { joNo?: string }>(rows: T[]): T[] {
  return [...rows].sort((x, y) =>
    compareJoNo(String(x.joNo ?? ""), String(y.joNo ?? "")),
  );
}

function stmtGet<T extends Record<string, unknown>>(
  db: DatabaseSync,
  sql: string,
  params: unknown[] = [],
): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

function lawIdInt(raw: string | number): number {
  const stored = normalizeLawIdForStorage(String(raw));
  const n = Number.parseInt(stored.replace(/\D/g, "") || "0", 10);
  return Number.isFinite(n) ? n : 0;
}

function padLawId(n: unknown): string {
  return normalizeLawIdForStorage(String(n ?? ""));
}

function fmtDate(n: unknown): string {
  const s = String(n ?? "").replace(/\D/g, "");
  if (s.length !== 8) return s || "";
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

export type OpenlawLawSummary = {
  lawId: string;
  lawName: string;
  lawAbbr: string;
  enforceDt: number;
  promulDt: number;
  deptNm: string;
  lawType: string;
  counts: {
    efydList: number;
    efydJo: number;
    nwList: number;
    nwJo: number;
    hstList: number;
    admrulList: number;
    oldnewList: number;
  };
  hasBody: boolean;
  /** Excel 크롤링 대상만 있고 openlaw_* 미수집 */
  crawlTargetOnly?: boolean;
  crawlTargetFlag?: string | null;
  crawlDocumentType?: string | null;
};

/** gwanselaw_list ∩ openlaw_efyd_info (본문 수집된 법령) */
export function listOpenlawLaws(): OpenlawLawSummary[] {
  const db = openDb();
  try {
    if (!tableExists(db, "openlaw_efyd_info")) return [];

    const hasGwan = tableExists(db, "gwanselaw_list");
    const rows = hasGwan
      ? stmtAll<Record<string, unknown>>(
          db,
          `
          SELECT
            oe.law_id,
            COALESCE(NULLIF(TRIM(oe.law_nm_ko), ''), NULLIF(TRIM(g.api_name), ''), '') AS law_nm,
            COALESCE(NULLIF(TRIM(oe.law_abbr), ''), NULLIF(TRIM(g.law_short_name), ''), '') AS law_abbr,
            COALESCE(oe.enforce_dt, 0) AS enforce_dt,
            COALESCE(oe.promul_dt, 0) AS promul_dt,
            COALESCE(oe.dept_nm, '') AS dept_nm,
            COALESCE(oe.law_type, '') AS law_type,
            COALESCE(g.upload_order, 999999) AS upload_order
          FROM openlaw_efyd_info oe
          LEFT JOIN gwanselaw_list g
            ON CAST(TRIM(g.law_id) AS INTEGER) = CAST(oe.law_id AS INTEGER)
          ORDER BY upload_order ASC, oe.law_nm_ko ASC
          `,
        )
      : stmtAll<Record<string, unknown>>(
          db,
          `
          SELECT
            law_id,
            COALESCE(law_nm_ko, '') AS law_nm,
            COALESCE(law_abbr, '') AS law_abbr,
            COALESCE(enforce_dt, 0) AS enforce_dt,
            COALESCE(promul_dt, 0) AS promul_dt,
            COALESCE(dept_nm, '') AS dept_nm,
            COALESCE(law_type, '') AS law_type
          FROM openlaw_efyd_info
          ORDER BY law_nm_ko ASC
          `,
        );

    const admrulList = tableExists(db, "openlaw_admrul_list")
      ? Number(
          stmtGet<{ c: number }>(
            db,
            `SELECT COUNT(*) AS c FROM openlaw_admrul_list`,
          )?.c ?? 0,
        )
      : 0;
    const oldnewList = tableExists(db, "openlaw_admrul_oldnew_list")
      ? Number(
          stmtGet<{ c: number }>(
            db,
            `SELECT COUNT(*) AS c FROM openlaw_admrul_oldnew_list`,
          )?.c ?? 0,
        )
      : 0;

    const seen = new Set<number>();
    const out: OpenlawLawSummary[] = [];

    for (const row of rows) {
      const idNum = lawIdInt(String(row.law_id ?? ""));
      if (!idNum || seen.has(idNum)) continue;
      seen.add(idNum);
      const lawId = padLawId(idNum);

      const count = (table: string) => {
        if (!tableExists(db, table)) return 0;
        const r = stmtGet<{ c: number }>(
          db,
          `SELECT COUNT(*) AS c FROM ${table} WHERE CAST(law_id AS INTEGER) = ?`,
          [idNum],
        );
        return Number(r?.c ?? 0);
      };

      out.push({
        lawId,
        lawName: String(row.law_nm ?? ""),
        lawAbbr: String(row.law_abbr ?? ""),
        enforceDt: Number(row.enforce_dt ?? 0),
        promulDt: Number(row.promul_dt ?? 0),
        deptNm: String(row.dept_nm ?? ""),
        lawType: String(row.law_type ?? ""),
        counts: {
          efydList: count("openlaw_efyd_list"),
          efydJo: count("openlaw_efyd_jo"),
          nwList: count("openlaw_nw_list"),
          nwJo: count("openlaw_nw_jo"),
          hstList: count("openlaw_hst_list"),
          admrulList,
          oldnewList,
        },
        hasBody: true,
      });
    }
    return out;
  } finally {
    db.close();
  }
}

function emptyOpenlawCounts(): OpenlawLawSummary["counts"] {
  return {
    efydList: 0,
    efydJo: 0,
    nwList: 0,
    nwJo: 0,
    hstList: 0,
    admrulList: 0,
    oldnewList: 0,
  };
}

function crawlTargetToOpenlawPlaceholder(
  target: AdminRulesCrawlTarget,
): OpenlawLawSummary {
  const portalId = normalizeLawIdForStorage(target.portalLawId || "");
  return {
    lawId: portalId || `crawl-${normalizeCrawlTargetRuleName(target.lawName).slice(0, 24)}`,
    lawName: target.lawName,
    lawAbbr: "",
    enforceDt: 0,
    promulDt: 0,
    deptNm: target.portalLawType || target.lawTypeCode || "",
    lawType: target.documentType || "법률",
    counts: emptyOpenlawCounts(),
    hasBody: false,
    crawlTargetOnly: true,
    crawlTargetFlag: target.targetFlag || null,
    crawlDocumentType: target.documentType || null,
  };
}

/**
 * Excel `01_크롤링대상` E열 법령(법률) + 기존 openlaw_* 수집본 병합
 */
export function listOpenlawLawsWithCrawlTargets(): {
  laws: OpenlawLawSummary[];
  crawlTargets: AdminRulesCrawlTargetMeta | null;
} {
  const dbLaws = listOpenlawLaws();
  const crawlBundle = getLawStatuteCrawlTargets();
  if (!crawlBundle) {
    return { laws: dbLaws, crawlTargets: null };
  }

  const byId = new Map<string, OpenlawLawSummary>();
  const byName = new Map<string, OpenlawLawSummary>();
  for (const law of dbLaws) {
    byId.set(normalizeLawIdForStorage(law.lawId), law);
    const nameKey = normalizeCrawlTargetRuleName(law.lawName);
    if (nameKey && !byName.has(nameKey)) byName.set(nameKey, law);
  }

  const merged: OpenlawLawSummary[] = [];
  const usedDbIds = new Set<string>();

  for (const target of crawlBundle.targets) {
    const portalId = normalizeLawIdForStorage(target.portalLawId || "");
    const nameKey = normalizeCrawlTargetRuleName(target.lawName);
    const fromDb =
      (portalId ? byId.get(portalId) : undefined) ??
      (nameKey ? byName.get(nameKey) : undefined);

    if (fromDb) {
      usedDbIds.add(normalizeLawIdForStorage(fromDb.lawId));
      merged.push({
        ...fromDb,
        lawName: fromDb.lawName || target.lawName,
        crawlTargetFlag: target.targetFlag || null,
        crawlDocumentType: target.documentType || null,
      });
      continue;
    }

    merged.push(crawlTargetToOpenlawPlaceholder(target));
  }

  for (const law of dbLaws) {
    const id = normalizeLawIdForStorage(law.lawId);
    if (usedDbIds.has(id)) continue;
    merged.push(law);
  }

  merged.sort((a, b) =>
    (a.lawName || a.lawId).localeCompare(b.lawName || b.lawId, "ko"),
  );

  return { laws: merged, crawlTargets: crawlBundle.meta };
}

export type OpenlawListRow = Record<string, unknown>;

export function listOpenlawEfydList(lawId: string): OpenlawListRow[] {
  const db = openDb();
  try {
    if (!tableExists(db, "openlaw_efyd_list")) return [];
    return stmtAll(
      db,
      `
      SELECT * FROM openlaw_efyd_list
      WHERE CAST(law_id AS INTEGER) = ?
      ORDER BY enforce_dt DESC, promul_dt DESC, law_seq DESC
      `,
      [lawIdInt(lawId)],
    ).map(normalizeListRow);
  } finally {
    db.close();
  }
}

export function getOpenlawEfydInfo(
  lawId: string,
  enforceDt?: number,
): OpenlawListRow | null {
  const db = openDb();
  try {
    if (!tableExists(db, "openlaw_efyd_info")) return null;
    const id = lawIdInt(lawId);
    const row = enforceDt
      ? stmtGet(
          db,
          `SELECT * FROM openlaw_efyd_info WHERE CAST(law_id AS INTEGER) = ? AND enforce_dt = ?`,
          [id, enforceDt],
        )
      : stmtGet(
          db,
          `SELECT * FROM openlaw_efyd_info WHERE CAST(law_id AS INTEGER) = ? ORDER BY enforce_dt DESC LIMIT 1`,
          [id],
        );
    return row ? normalizeInfoRow(row) : null;
  } finally {
    db.close();
  }
}

export function listOpenlawEfydJo(
  lawId: string,
  enforceDt?: number,
): OpenlawListRow[] {
  const db = openDb();
  try {
    if (!tableExists(db, "openlaw_efyd_jo")) return [];
    const id = lawIdInt(lawId);
    const rows = enforceDt
      ? stmtAll(
          db,
          `
          SELECT * FROM openlaw_efyd_jo
          WHERE CAST(law_id AS INTEGER) = ? AND enforce_dt = ?
          ORDER BY jo_no ASC
          `,
          [id, enforceDt],
        )
      : stmtAll(
          db,
          `
          SELECT * FROM openlaw_efyd_jo
          WHERE CAST(law_id AS INTEGER) = ?
          ORDER BY enforce_dt DESC, jo_no ASC
          `,
          [id],
        );
    return sortByJoNoNatural(rows.map(normalizeJoRow));
  } finally {
    db.close();
  }
}

export function listOpenlawNwList(lawId: string): OpenlawListRow[] {
  const db = openDb();
  try {
    if (!tableExists(db, "openlaw_nw_list")) return [];
    return stmtAll(
      db,
      `
      SELECT * FROM openlaw_nw_list
      WHERE CAST(law_id AS INTEGER) = ?
      ORDER BY promul_dt DESC, law_seq DESC
      `,
      [lawIdInt(lawId)],
    ).map(normalizeListRow);
  } finally {
    db.close();
  }
}

export function getOpenlawNwInfo(
  lawId: string,
  promulDt?: number,
): OpenlawListRow | null {
  const db = openDb();
  try {
    if (!tableExists(db, "openlaw_nw_info")) return null;
    const id = lawIdInt(lawId);
    const row = promulDt
      ? stmtGet(
          db,
          `SELECT * FROM openlaw_nw_info WHERE CAST(law_id AS INTEGER) = ? AND promul_dt = ?`,
          [id, promulDt],
        )
      : stmtGet(
          db,
          `SELECT * FROM openlaw_nw_info WHERE CAST(law_id AS INTEGER) = ? ORDER BY promul_dt DESC LIMIT 1`,
          [id],
        );
    return row ? normalizeInfoRow(row) : null;
  } finally {
    db.close();
  }
}

export function listOpenlawNwJo(
  lawId: string,
  promulDt?: number,
): OpenlawListRow[] {
  const db = openDb();
  try {
    if (!tableExists(db, "openlaw_nw_jo")) return [];
    const id = lawIdInt(lawId);
    const rows = promulDt
      ? stmtAll(
          db,
          `
          SELECT * FROM openlaw_nw_jo
          WHERE CAST(law_id AS INTEGER) = ? AND promul_dt = ?
          ORDER BY jo_no ASC
          `,
          [id, promulDt],
        )
      : stmtAll(
          db,
          `
          SELECT * FROM openlaw_nw_jo
          WHERE CAST(law_id AS INTEGER) = ?
          ORDER BY promul_dt DESC, jo_no ASC
          `,
          [id],
        );
    return sortByJoNoNatural(rows.map(normalizeJoRow));
  } finally {
    db.close();
  }
}

export function listOpenlawHstList(lawId: string): OpenlawListRow[] {
  const db = openDb();
  try {
    if (!tableExists(db, "openlaw_hst_list")) return [];
    return stmtAll(
      db,
      `
      SELECT * FROM openlaw_hst_list
      WHERE CAST(law_id AS INTEGER) = ?
      ORDER BY promul_dt DESC, law_seq DESC
      `,
      [lawIdInt(lawId)],
    ).map(normalizeListRow);
  } finally {
    db.close();
  }
}

export function getOpenlawHstInfo(
  lawId: string,
  promulDt?: number,
): OpenlawListRow | null {
  const db = openDb();
  try {
    if (!tableExists(db, "openlaw_hst_info")) return null;
    const id = lawIdInt(lawId);
    const row = promulDt
      ? stmtGet(
          db,
          `SELECT * FROM openlaw_hst_info WHERE CAST(law_id AS INTEGER) = ? AND promul_dt = ?`,
          [id, promulDt],
        )
      : stmtGet(
          db,
          `SELECT * FROM openlaw_hst_info WHERE CAST(law_id AS INTEGER) = ? ORDER BY promul_dt DESC LIMIT 1`,
          [id],
        );
    return row ? normalizeInfoRow(row) : null;
  } finally {
    db.close();
  }
}

export function listOpenlawAdmrulList(): OpenlawListRow[] {
  const db = openDb();
  try {
    if (!tableExists(db, "openlaw_admrul_list")) return [];
    return stmtAll(
      db,
      `
      SELECT * FROM openlaw_admrul_list
      ORDER BY issue_dt DESC, admrul_seq DESC
      `,
    ).map((row) => ({
      admrulSeq: Number(row.admrul_seq ?? 0),
      admrulNm: String(row.admrul_nm ?? ""),
      issueDt: Number(row.issue_dt ?? 0),
      issueDtLabel: fmtDate(row.issue_dt),
      issueNo: String(row.issue_no ?? ""),
      enactType: String(row.enact_type ?? ""),
      deptNm: String(row.dept_nm ?? ""),
      admrulType: String(row.admrul_type ?? ""),
      enforceDt: Number(row.enforce_dt ?? 0),
      enforceDtLabel: fmtDate(row.enforce_dt),
      admrulLink: String(row.admrul_link ?? ""),
      crawledAt: String(row.crawled_at ?? ""),
    }));
  } finally {
    db.close();
  }
}

export function listOpenlawAdmrulInfo(admrulSeq: number): OpenlawListRow[] {
  const db = openDb();
  try {
    if (!tableExists(db, "openlaw_admrul_info")) return [];
    const rows = stmtAll(
      db,
      `
      SELECT * FROM openlaw_admrul_info
      WHERE admrul_seq = ?
      ORDER BY jo_no ASC
      `,
      [admrulSeq],
    );
    return sortByJoNoNatural(rows.map(normalizeJoRow));
  } finally {
    db.close();
  }
}

export function listOpenlawOldnewList(): OpenlawListRow[] {
  const db = openDb();
  try {
    if (!tableExists(db, "openlaw_admrul_oldnew_list")) return [];
    return stmtAll(
      db,
      `
      SELECT * FROM openlaw_admrul_oldnew_list
      ORDER BY new_issue_dt DESC, oldnew_seq DESC
      `,
    ).map((row) => ({
      oldnewSeq: Number(row.oldnew_seq ?? 0),
      admrulNm: String(row.admrul_nm ?? ""),
      oldIssueDt: Number(row.old_issue_dt ?? 0),
      oldIssueDtLabel: fmtDate(row.old_issue_dt),
      oldIssueNo: String(row.old_issue_no ?? ""),
      newIssueDt: Number(row.new_issue_dt ?? 0),
      newIssueDtLabel: fmtDate(row.new_issue_dt),
      newIssueNo: String(row.new_issue_no ?? ""),
      deptNm: String(row.dept_nm ?? ""),
      crawledAt: String(row.crawled_at ?? ""),
    }));
  } finally {
    db.close();
  }
}

export function listOpenlawOldnewInfo(
  admrulSeq: number,
  enforceDt?: number,
): OpenlawListRow[] {
  const db = openDb();
  try {
    if (!tableExists(db, "openlaw_admrul_oldnew_info")) return [];
    const rows = enforceDt
      ? stmtAll(
          db,
          `
          SELECT * FROM openlaw_admrul_oldnew_info
          WHERE admrul_seq = ? AND enforce_dt = ?
          ORDER BY jo_no ASC
          `,
          [admrulSeq, enforceDt],
        )
      : stmtAll(
          db,
          `
          SELECT * FROM openlaw_admrul_oldnew_info
          WHERE admrul_seq = ?
          ORDER BY enforce_dt DESC, jo_no ASC
          `,
          [admrulSeq],
        );
    return sortByJoNoNatural(
      rows.map((row) => ({
        admrulSeq: Number(row.admrul_seq ?? 0),
        enforceDt: Number(row.enforce_dt ?? 0),
        enforceDtLabel: fmtDate(row.enforce_dt),
        joNo: String(row.jo_no ?? ""),
        oldJoContent: String(row.old_jo_content ?? ""),
        newJoContent: String(row.new_jo_content ?? ""),
        crawledAt: String(row.crawled_at ?? ""),
      })),
    );
  } finally {
    db.close();
  }
}

function normalizeListRow(row: Record<string, unknown>): OpenlawListRow {
  return {
    lawSeq: Number(row.law_seq ?? 0),
    historyCode: String(row.history_code ?? ""),
    lawNm: String(row.law_nm ?? ""),
    lawAbbr: String(row.law_abbr ?? ""),
    lawId: padLawId(row.law_id),
    promulDt: Number(row.promul_dt ?? 0),
    promulDtLabel: fmtDate(row.promul_dt),
    promulNo: Number(row.promul_no ?? 0),
    enactType: String(row.enact_type ?? ""),
    deptCd: String(row.dept_cd ?? ""),
    deptNm: String(row.dept_nm ?? ""),
    lawType: String(row.law_type ?? ""),
    jointOrdYn: String(row.joint_ord_yn ?? ""),
    promulNoJoint: String(row.promul_no_joint ?? ""),
    enforceDt: Number(row.enforce_dt ?? 0),
    enforceDtLabel: fmtDate(row.enforce_dt),
    selfLawYn: String(row.self_law_yn ?? ""),
    lawLink: String(row.law_link ?? ""),
    crawledAt: String(row.crawled_at ?? ""),
  };
}

function normalizeInfoRow(row: Record<string, unknown>): OpenlawListRow {
  return {
    lawId: padLawId(row.law_id),
    lawSeq: Number(row.law_seq ?? 0),
    enforceDt: Number(row.enforce_dt ?? 0),
    enforceDtLabel: fmtDate(row.enforce_dt),
    promulDt: Number(row.promul_dt ?? 0),
    promulDtLabel: fmtDate(row.promul_dt),
    promulNo: Number(row.promul_no ?? 0),
    lang: String(row.lang ?? ""),
    lawType: String(row.law_type ?? ""),
    lawTypeCd: String(row.law_type_cd ?? ""),
    lawNmKo: String(row.law_nm_ko ?? ""),
    lawNmCn: String(row.law_nm_cn ?? ""),
    lawAbbr: String(row.law_abbr ?? ""),
    titleChangeYn: String(row.title_change_yn ?? ""),
    koLawYn: String(row.ko_law_yn ?? ""),
    chapterSeq: Number(row.chapter_seq ?? 0),
    deptCd: Number(row.dept_cd ?? 0),
    deptNm: String(row.dept_nm ?? ""),
    phone: String(row.phone ?? ""),
    enactType: String(row.enact_type ?? ""),
    annexEditYn: String(row.annex_edit_yn ?? ""),
    promulLawYn: String(row.promul_law_yn ?? ""),
    contactDept: String(row.contact_dept ?? ""),
    contactPhone: String(row.contact_phone ?? ""),
    jointOrdType: String(row.joint_ord_type ?? ""),
    crawledAt: String(row.crawled_at ?? ""),
  };
}

function normalizeJoRow(row: Record<string, unknown>): OpenlawListRow {
  return {
    lawId: row.law_id != null ? padLawId(row.law_id) : undefined,
    admrulSeq:
      row.admrul_seq != null ? Number(row.admrul_seq) : undefined,
    enforceDt: Number(row.enforce_dt ?? 0),
    enforceDtLabel: fmtDate(row.enforce_dt),
    promulDt: Number(row.promul_dt ?? 0),
    promulDtLabel: fmtDate(row.promul_dt),
    joNo: String(row.jo_no ?? ""),
    joYn: String(row.jo_yn ?? ""),
    joTitle: String(row.jo_title ?? ""),
    joEnforceDt: Number(row.jo_enforce_dt ?? 0),
    joEnforceDtLabel: fmtDate(row.jo_enforce_dt),
    joContent: String(row.jo_content ?? ""),
    hang: String(row.hang ?? ""),
    ho: String(row.ho ?? ""),
    mok: String(row.mok ?? ""),
    crawledAt: String(row.crawled_at ?? ""),
  };
}
