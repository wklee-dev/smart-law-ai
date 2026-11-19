import "server-only";

import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { normalizeClipCustomsChiefHsQuery } from "@/app/lib/clip-customs-chief-shared";
import { rewriteClipPortalHtml } from "@/app/lib/clip-imex-notice-server";
import {
  CLIP_INTEGRATED_NOTICE_SORT_KEYS,
  parseClipIntegratedNoticeOptionLabel,
  type ClipIntegratedNoticeIssueRow,
  type ClipIntegratedNoticeListRow,
  type ClipIntegratedNoticeQueryParams,
  type ClipIntegratedNoticeSortKey,
  type ClipIntegratedNoticeSummary,
} from "@/app/lib/clip-integrated-notice-shared";
import { getSmartLawSqliteDbPath } from "@/app/lib/smart-law-sqlite-paths";

export {
  type ClipIntegratedNoticeIssueRow,
  type ClipIntegratedNoticeListRow,
  type ClipIntegratedNoticeQueryParams,
  type ClipIntegratedNoticeSummary,
} from "@/app/lib/clip-integrated-notice-shared";

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : 0;
}

function hasTable(db: DatabaseSync, name: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(name) as { name: string } | undefined;
  return Boolean(row?.name);
}

export function openClipIntegratedNoticeDb(): DatabaseSync {
  const p = getSmartLawSqliteDbPath();
  if (!fs.existsSync(p)) {
    throw new Error(`DB 파일이 없습니다: ${p}`);
  }
  const db = new DatabaseSync(p, { readOnly: true });
  if (!hasTable(db, "clip_integrated_notice_items")) {
    db.close();
    throw new Error(
      "clip_integrated_notice_items 테이블이 없습니다. clip_crawler.py로 통합공고를 수집하세요.",
    );
  }
  return db;
}

function normalizeSort(
  sort: string | null | undefined,
): ClipIntegratedNoticeSortKey {
  const s = (sort ?? "hs_code").trim();
  return (CLIP_INTEGRATED_NOTICE_SORT_KEYS as readonly string[]).includes(s)
    ? (s as ClipIntegratedNoticeSortKey)
    : "hs_code";
}

const SORT_SQL: Record<ClipIntegratedNoticeSortKey, string> = {
  hs_code: "TRIM(IFNULL(i.hs_code, ''))",
  product_name: "TRIM(IFNULL(i.product_name, ''))",
  related_law_name: "TRIM(IFNULL(i.related_law_name, ''))",
  guidance_type_name: "TRIM(IFNULL(i.guidance_type_name, ''))",
};

const CLIP_INTEGRATED_NOTICE_LIST_PAGE_URL =
  "https://unipass.customs.go.kr/clip/hsinfosrch/openULS0205002Q.do";
const CLIP_INTEGRATED_NOTICE_LIST_API_URL =
  "https://unipass.customs.go.kr/clip/hsinfosrch/retrieveUnfcPbanCmdtLst.do";

const PORTAL_ISSUE_LABEL_TTL_MS = 60 * 60 * 1000;

const PORTAL_FETCH_HEADERS = {
  "User-Agent": "smart-law-ai/clip-integrated-notice",
  "Accept-Language": "ko-KR,ko;q=0.9",
};

type PortalIssueOption = {
  issue_code: string;
  notice_rule_no: string;
  notice_no: string;
  notice_date: string;
};

let portalIssueCache:
  | { fetchedAt: number; issues: PortalIssueOption[] }
  | undefined;

function getIntegratedNoticeItemCounts(db: DatabaseSync): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of db
    .prepare(
      `SELECT issue_code, COUNT(*) AS item_count
       FROM clip_integrated_notice_items
       GROUP BY issue_code`,
    )
    .all()) {
    const r = row as Record<string, unknown>;
    counts.set(str(r.issue_code), num(r.item_count));
  }
  return counts;
}

function listIntegratedNoticeIssuesFromDb(
  db: DatabaseSync,
): ClipIntegratedNoticeIssueRow[] {
  if (hasTable(db, "clip_integrated_notice_master")) {
    return db
      .prepare(
        `SELECT m.issue_code,
                m.notice_rule_no,
                m.notice_no,
                m.notice_date,
                m.notice_date AS issued_date,
                COALESCE(m.total_item_count, 0) AS item_count
         FROM clip_integrated_notice_master m
         ORDER BY m.notice_date DESC, m.issue_code DESC`,
      )
      .all()
      .map((row) => {
        const r = row as Record<string, unknown>;
        return {
          issue_code: str(r.issue_code),
          notice_rule_no: str(r.notice_rule_no),
          notice_no: str(r.notice_no),
          notice_date: str(r.notice_date),
          issued_date: str(r.issued_date),
          item_count: num(r.item_count),
        };
      });
  }

  return db
    .prepare(
      `SELECT issue_code,
              MAX(notice_rule_no) AS notice_rule_no,
              MAX(issued_date) AS issued_date,
              COUNT(*) AS item_count
       FROM clip_integrated_notice_items
       GROUP BY issue_code
       ORDER BY issued_date DESC, issue_code DESC`,
    )
    .all()
    .map((row) => {
      const r = row as Record<string, unknown>;
      return {
        issue_code: str(r.issue_code),
        notice_rule_no: str(r.notice_rule_no),
        notice_no: "",
        notice_date: "",
        issued_date: str(r.issued_date),
        item_count: num(r.item_count),
      };
    });
}

async function fetchClipIntegratedNoticePortalIssues(): Promise<
  PortalIssueOption[]
> {
  const now = Date.now();
  if (
    portalIssueCache &&
    now - portalIssueCache.fetchedAt < PORTAL_ISSUE_LABEL_TTL_MS
  ) {
    return portalIssueCache.issues;
  }

  const res = await fetch(CLIP_INTEGRATED_NOTICE_LIST_PAGE_URL, {
    headers: PORTAL_FETCH_HEADERS,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`통합공고 포털 발령번호 조회 실패 (${res.status})`);
  }

  const html = await res.text();
  const issues: PortalIssueOption[] = [];
  const optionRe =
    /<option[^>]*value="([^"]+)"[^>]*>([^<]+)<\/option>/gi;
  for (const match of html.matchAll(optionRe)) {
    const rawValue = str(match[1]);
    const label = str(match[2]);
    if (!rawValue.includes(",")) continue;
    const [noticeRuleNo, issueCode] = rawValue.split(",", 2);
    const parsed = parseClipIntegratedNoticeOptionLabel(label);
    issues.push({
      issue_code: issueCode.trim(),
      notice_rule_no: noticeRuleNo.trim(),
      notice_no: parsed.notice_no,
      notice_date: parsed.notice_date,
    });
  }

  portalIssueCache = { fetchedAt: now, issues };
  return issues;
}

function mergePortalIssuesWithCounts(
  portalIssues: PortalIssueOption[],
  counts: Map<string, number>,
): ClipIntegratedNoticeIssueRow[] {
  return portalIssues.map((portal) => ({
    issue_code: portal.issue_code,
    notice_rule_no: portal.notice_rule_no,
    notice_no: portal.notice_no,
    notice_date: portal.notice_date,
    issued_date: portal.notice_date,
    item_count: counts.get(portal.issue_code) ?? 0,
  }));
}

export async function listClipIntegratedNoticeIssues(
  db: DatabaseSync,
): Promise<ClipIntegratedNoticeIssueRow[]> {
  const counts = getIntegratedNoticeItemCounts(db);

  if (hasTable(db, "clip_integrated_notice_master")) {
    const masterIssues = listIntegratedNoticeIssuesFromDb(db);
    if (masterIssues.length > 0) return masterIssues;
  }

  const dbIssues = listIntegratedNoticeIssuesFromDb(db);

  try {
    const portalIssues = await fetchClipIntegratedNoticePortalIssues();
    if (portalIssues.length > 0) {
      return mergePortalIssuesWithCounts(portalIssues, counts);
    }
  } catch {
    /* 포털 조회 실패 시 DB 목록으로 폴백 */
  }

  return dbIssues;
}

function buildWhere(params: ClipIntegratedNoticeQueryParams): {
  sql: string;
  bind: unknown[];
} {
  const parts = ["i.issue_code = ?"];
  const bind: unknown[] = [params.issueCode];

  const hs = normalizeClipCustomsChiefHsQuery(params.hsCode);
  if (hs) {
    parts.push(
      "REPLACE(REPLACE(TRIM(IFNULL(i.hs_code, '')), '.', ''), '-', '') LIKE ?",
    );
    bind.push(`${hs}%`);
  }

  const kw = str(params.keyword);
  if (kw) {
    parts.push(
      "(TRIM(IFNULL(i.import_export_guidance, '')) LIKE ? OR TRIM(IFNULL(i.product_name, '')) LIKE ?)",
    );
    bind.push(`%${kw}%`, `%${kw}%`);
  }

  const direction = str(params.direction);
  if (direction === "11") {
    parts.push(
      "(TRIM(IFNULL(i.guidance_type_code, '')) = '11' OR TRIM(IFNULL(i.guidance_type_name, '')) LIKE '%수출%')",
    );
  } else if (direction === "12") {
    parts.push(
      "(TRIM(IFNULL(i.guidance_type_code, '')) = '12' OR TRIM(IFNULL(i.guidance_type_name, '')) LIKE '%수입%')",
    );
  }

  return { sql: parts.join(" AND "), bind };
}

function countItemsForIssue(db: DatabaseSync, issueCode: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM clip_integrated_notice_items WHERE issue_code = ?`,
    )
    .get(issueCode) as { c: number } | undefined;
  return num(row?.c);
}

async function openClipIntegratedNoticePortalSession(): Promise<string> {
  const res = await fetch(CLIP_INTEGRATED_NOTICE_LIST_PAGE_URL, {
    headers: PORTAL_FETCH_HEADERS,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`통합공고 포털 세션 오류 (${res.status})`);
  }
  const cookies =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [];
  const cookieHeader = cookies.map((c) => c.split(";")[0]).join("; ");
  if (!cookieHeader) {
    throw new Error("통합공고 포털 세션이 필요합니다.");
  }
  return cookieHeader;
}

function mapPortalNoticeRow(
  item: Record<string, unknown>,
  fallbackId: number,
): ClipIntegratedNoticeListRow {
  const srno = num(item.imexKnckSrno);
  return {
    item_id: srno || fallbackId,
    hs_code: str(item.hsSgn),
    product_name: str(item.prnmCn),
    import_export_guidance: str(item.imexKnckCn),
    related_law_name: str(item.relaLworNm),
    related_link: str(item.rltnLnk),
    guidance_type_code: str(item.imexKnckTpcd),
    guidance_type_name: str(item.imexKnckTpcdNm),
  };
}

function sortIntegratedNoticeRowsInMemory(
  rows: ClipIntegratedNoticeListRow[],
  sortKey: string | null | undefined,
  sortDir: string | null | undefined,
): ClipIntegratedNoticeListRow[] {
  const sort = normalizeSort(sortKey);
  const desc = sortDir?.trim().toLowerCase() === "desc";
  const getters: Record<
    ClipIntegratedNoticeSortKey,
    (row: ClipIntegratedNoticeListRow) => string
  > = {
    hs_code: (row) => row.hs_code,
    product_name: (row) => row.product_name,
    related_law_name: (row) => row.related_law_name,
    guidance_type_name: (row) => row.guidance_type_name,
  };
  const getter = getters[sort];
  return [...rows].sort((a, b) => {
    const cmp = getter(a).localeCompare(getter(b), "ko");
    return desc ? -cmp : cmp;
  });
}

async function queryClipIntegratedNoticeItemsFromPortal(
  params: ClipIntegratedNoticeQueryParams,
): Promise<{ rows: ClipIntegratedNoticeListRow[]; total: number }> {
  const cookieHeader = await openClipIntegratedNoticePortalSession();
  const page = Math.max(1, params.page);
  const pageSize = Math.min(100, Math.max(5, Math.floor(params.pageSize)));
  const hs = normalizeClipCustomsChiefHsQuery(params.hsCode);

  const body = new URLSearchParams({
    lworPmgtGoor: params.issueCode,
    imexTpcd: str(params.direction),
    hsSgn: hs,
    imexKnckCn: str(params.keyword),
    pageIndex: String(page),
    pageUnit: String(pageSize),
    orderColumns: "",
  });

  const res = await fetch(CLIP_INTEGRATED_NOTICE_LIST_API_URL, {
    method: "POST",
    headers: {
      ...PORTAL_FETCH_HEADERS,
      Cookie: cookieHeader,
      "X-Requested-With": "XMLHttpRequest",
      Referer: CLIP_INTEGRATED_NOTICE_LIST_PAGE_URL,
      Accept: "application/json, text/javascript, */*; q=0.01",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`통합공고 포털 조회 실패 (${res.status})`);
  }

  const json = (await res.json()) as Record<string, unknown>;
  if (str(json.error) === "true") {
    throw new Error(str(json.message) || "통합공고 포털 조회 오류");
  }

  const rawRows = json.rUnfcPbanCmdtLst;
  if (!Array.isArray(rawRows)) {
    throw new Error("통합공고 포털 응답 구조가 예상과 다릅니다.");
  }

  const pagination = (json.paginationInfo ?? {}) as Record<string, unknown>;
  const total = num(pagination.totalRecordCount);
  const rows = sortIntegratedNoticeRowsInMemory(
    rawRows.map((item, index) =>
      mapPortalNoticeRow(item as Record<string, unknown>, index + 1),
    ),
    params.sort,
    params.sort_dir,
  );

  return { rows, total };
}

function queryClipIntegratedNoticeItemsFromDb(
  db: DatabaseSync,
  params: ClipIntegratedNoticeQueryParams,
): { rows: ClipIntegratedNoticeListRow[]; total: number } {
  const { sql: whereSql, bind } = buildWhere(params);
  const sort = normalizeSort(params.sort);
  const dir = params.sort_dir?.trim().toLowerCase() === "desc" ? "DESC" : "ASC";
  const page = Math.max(1, params.page);
  const pageSize = Math.min(100, Math.max(5, Math.floor(params.pageSize)));
  const offset = (page - 1) * pageSize;

  const totalRow = db
    .prepare(
      `SELECT COUNT(*) AS c FROM clip_integrated_notice_items i WHERE ${whereSql}`,
    )
    .get(...bind) as { c: number } | undefined;
  const total = num(totalRow?.c);

  const rows = db
    .prepare(
      `SELECT i.item_id, i.hs_code, i.product_name, i.import_export_guidance,
              i.related_law_name, i.related_link, i.guidance_type_code,
              i.guidance_type_name
       FROM clip_integrated_notice_items i
       WHERE ${whereSql}
       ORDER BY ${SORT_SQL[sort]} ${dir}, i.item_id ASC
       LIMIT ? OFFSET ?`,
    )
    .all(...bind, pageSize, offset)
    .map((row) => {
      const r = row as Record<string, unknown>;
      return {
        item_id: num(r.item_id),
        hs_code: str(r.hs_code),
        product_name: str(r.product_name),
        import_export_guidance: str(r.import_export_guidance),
        related_law_name: str(r.related_law_name),
        related_link: str(r.related_link),
        guidance_type_code: str(r.guidance_type_code),
        guidance_type_name: str(r.guidance_type_name),
      };
    });

  return { rows, total };
}

export async function queryClipIntegratedNoticeItems(
  db: DatabaseSync,
  params: ClipIntegratedNoticeQueryParams,
): Promise<{ rows: ClipIntegratedNoticeListRow[]; total: number }> {
  if (countItemsForIssue(db, params.issueCode) > 0) {
    return queryClipIntegratedNoticeItemsFromDb(db, params);
  }
  return queryClipIntegratedNoticeItemsFromPortal(params);
}

export function getClipIntegratedNoticeSummary(
  db: DatabaseSync,
): ClipIntegratedNoticeSummary | null {
  if (!hasTable(db, "clip_integrated_notice_general_info")) return null;
  const row = db
    .prepare(
      `SELECT title, body_text, raw_html
       FROM clip_integrated_notice_general_info
       ORDER BY last_collected_at DESC, general_info_id DESC
       LIMIT 1`,
    )
    .get() as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    title: str(row.title),
    body_html: rewriteClipPortalHtml(str(row.raw_html)),
    body_text: str(row.body_text),
  };
}

export function countClipIntegratedNoticeItems(db: DatabaseSync): number {
  const row = db
    .prepare("SELECT COUNT(*) AS c FROM clip_integrated_notice_items")
    .get() as { c: number } | undefined;
  return num(row?.c);
}
