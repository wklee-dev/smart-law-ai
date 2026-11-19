import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  resolveDomesticHsClassDbPath,
} from "@/app/lib/domestic-hs-class-paths";

export type DomesticHsDb = DatabaseSync;

const COMMITTEE_CODES = new Set(["", "A", "B", "C"]);

export type OpenDomesticHsClassDbOptions = {
  since2006?: boolean;
};

export function openDomesticHsClassDb(
  opts?: OpenDomesticHsClassDbOptions,
): DatabaseSync {
  const p = resolveDomesticHsClassDbPath(opts);
  if (!fs.existsSync(p)) {
    throw new Error(`품목분류 국내사례 DB 파일이 없습니다: ${p}`);
  }
  return new DatabaseSync(p);
}

/** 요청 본문·쿼리의 since2006 플래그 */
export function parseDomesticHsSince2006(input: unknown): boolean {
  if (input === true || input === 1) return true;
  if (typeof input === "string") {
    const t = input.trim().toLowerCase();
    return t === "1" || t === "true" || t === "yes";
  }
  return false;
}

export type ClassificationSearchBody = {
  committeeType?: string;
  reff_no?: string;
  dtrm_hs_sgn?: string;
  enfr_dt_from?: string;
  enfr_dt_to?: string;
  cmdt_nm?: string;
  cmdt_desc?: string;
  dtrm_rsn_cn?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
};

export type CommitteeBucketCode = "A" | "B" | "C";

export type ClassificationFiltersOnly = Omit<
  ClassificationSearchBody,
  "committeeType" | "page" | "pageSize"
>;

export type GroupedClassificationQuery = {
  filters: ClassificationFiltersOnly;
  buckets: CommitteeBucketCode[];
  bucketPages: Partial<Record<CommitteeBucketCode, number>>;
  pageSize: number;
};

export type ParsedClassificationQuery =
  | { mode: "single"; body: ClassificationSearchBody }
  | { mode: "grouped"; grouped: GroupedClassificationQuery };

export type ClassificationListRow = {
  id: number;
  committee_type: string;
  committee_name: string;
  rrdc_no: string | null;
  reff_no: string | null;
  enfr_dt: string | null;
  cstm_nm: string | null;
  dtrm_hs_sgn: string | null;
  cmdt_nm: string | null;
  imge_cnt: number | null;
};

/** LIKE 에서 `\`, `%`, `_` 이스케이프 */
export function escapeSqlLike(pattern: string): string {
  return pattern.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function trimOrUndef(s: unknown): string | undefined {
  if (typeof s !== "string") return undefined;
  const t = s.trim();
  return t.length === 0 ? undefined : t;
}

function normalizedCommitteeType(raw?: string): string {
  const t = (raw ?? "").trim().toUpperCase();
  return COMMITTEE_CODES.has(t) ? t : "";
}

/** 조회 최소 한 항목: 텍스트·날짜 범위·검색어 중 하나라도 있어야 함 */
export function hasClassificationSearchCriterion(
  body: ClassificationFiltersOnly,
): boolean {
  const fields = [
    body.reff_no,
    body.dtrm_hs_sgn,
    body.cmdt_nm,
    body.cmdt_desc,
    body.dtrm_rsn_cn,
    body.keyword,
    body.enfr_dt_from,
    body.enfr_dt_to,
  ];
  return fields.some((v) => typeof v === "string" && v.trim().length > 0);
}

function classificationFiltersFromInput(
  input: Record<string, unknown>,
): ClassificationFiltersOnly {
  return {
    reff_no: trimOrUndef(input.reff_no),
    dtrm_hs_sgn: trimOrUndef(input.dtrm_hs_sgn),
    enfr_dt_from: trimOrUndef(input.enfr_dt_from),
    enfr_dt_to: trimOrUndef(input.enfr_dt_to),
    cmdt_nm: trimOrUndef(input.cmdt_nm),
    cmdt_desc: trimOrUndef(input.cmdt_desc),
    dtrm_rsn_cn: trimOrUndef(input.dtrm_rsn_cn),
    keyword: trimOrUndef(input.keyword),
  };
}

function parseBucketsInput(input: unknown): CommitteeBucketCode[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const seen = new Set<CommitteeBucketCode>();
  const out: CommitteeBucketCode[] = [];
  for (const x of input) {
    const u = typeof x === "string" ? x.trim().toUpperCase() : "";
    if (
      (u === "A" || u === "B" || u === "C") &&
      !seen.has(u as CommitteeBucketCode)
    ) {
      seen.add(u as CommitteeBucketCode);
      out.push(u as CommitteeBucketCode);
    }
  }
  return out.length ? out : undefined;
}

function parseBucketPagesInput(
  input: unknown,
  buckets: CommitteeBucketCode[],
): Partial<Record<CommitteeBucketCode, number>> {
  const raw =
    typeof input === "object" && input !== null
      ? (input as Record<string, unknown>)
      : {};
  const out: Partial<Record<CommitteeBucketCode, number>> = {};
  for (const b of buckets) {
    const n = Number(raw[b]);
    out[b] = Math.max(
      1,
      Number.isFinite(n) && Number.isInteger(n) ? n : 1,
    );
  }
  return out;
}

/**
 * 단일 조회 및 위원회(A/B/C) 분리 그룹 조회를 같은 검증으로 파싱합니다.
 */
export function parseClassificationQuery(
  input: Record<string, unknown>,
):
  | { ok: true; parsed: ParsedClassificationQuery }
  | { ok: false; error: string } {
  const filters = classificationFiltersFromInput(input);
  if (!hasClassificationSearchCriterion(filters)) {
    return { ok: false, error: "조회 조건을 한 가지 이상 입력하세요." };
  }

  const pageSizeRaw = Number(input.pageSize) || 10;
  const pageSize = Math.min(100, Math.max(5, Math.floor(pageSizeRaw)));

  if (Boolean(input.grouped)) {
    let buckets =
      parseBucketsInput(input.buckets) ??
      (["A", "B", "C"] as CommitteeBucketCode[]);
    buckets = buckets.filter((x) => x === "A" || x === "B" || x === "C");
    if (buckets.length === 0) buckets = ["A", "B", "C"];

    const bucketPages = parseBucketPagesInput(input.bucketPages, buckets);
    return {
      ok: true,
      parsed: {
        mode: "grouped",
        grouped: {
          filters,
          buckets,
          bucketPages,
          pageSize,
        },
      },
    };
  }

  const committeeType = normalizedCommitteeType(
    trimOrUndef(input.committeeType) ?? "",
  );
  const page = Math.max(1, Number(input.page) || 1);
  const body: ClassificationSearchBody = {
    ...filters,
    committeeType:
      committeeType === "" ? undefined : committeeType.toUpperCase(),
    page,
    pageSize,
  };

  return { ok: true, parsed: { mode: "single", body } };
}

/** 레거시: grouped 없이 단일 조회 요청 파싱 */
export function normalizeClassificationSearchBody(
  input: Record<string, unknown>,
): { ok: true; body: ClassificationSearchBody } | { ok: false; error: string } {
  const pq = parseClassificationQuery(input);
  if (!pq.ok) return pq;
  if (pq.parsed.mode === "single") return { ok: true, body: pq.parsed.body };
  return {
    ok: false,
    error:
      "그룹 조회는 grouped: true 로 요청해야 합니다. API 문서(parseClassificationQuery)를 참고하세요.",
  };
}

function buildWhere(body: ClassificationSearchBody): {
  sql: string;
  params: unknown[];
} {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (body.committeeType) {
    clauses.push(`committee_type = ?`);
    params.push(body.committeeType);
  }

  const bindLike = (
    column: string,
    value: string | undefined,
  ): void => {
    if (!value) return;
    const esc = escapeSqlLike(value);
    clauses.push(
      `${column} LIKE '%' || ? || '%' ESCAPE '\\' COLLATE NOCASE`,
    );
    params.push(esc);
  };

  bindLike("reff_no", body.reff_no);
  bindLike("dtrm_hs_sgn", body.dtrm_hs_sgn);
  bindLike("cmdt_nm", body.cmdt_nm);
  bindLike("cmdt_desc", body.cmdt_desc);
  bindLike("dtrm_rsn_cn", body.dtrm_rsn_cn);

  if (body.enfr_dt_from) {
    clauses.push("(enfr_dt IS NOT NULL AND enfr_dt >= ?)");
    params.push(body.enfr_dt_from);
  }
  if (body.enfr_dt_to) {
    clauses.push("(enfr_dt IS NOT NULL AND enfr_dt <= ?)");
    params.push(body.enfr_dt_to);
  }

  if (body.keyword) {
    const esc = escapeSqlLike(body.keyword);
    const kwOr = `(reff_no LIKE '%'||?||'%' ESCAPE '\\' COLLATE NOCASE
      OR rrdc_no LIKE '%'||?||'%' ESCAPE '\\' COLLATE NOCASE
      OR dtrm_hs_sgn LIKE '%'||?||'%' ESCAPE '\\' COLLATE NOCASE
      OR cmdt_nm LIKE '%'||?||'%' ESCAPE '\\' COLLATE NOCASE
      OR cmdt_desc LIKE '%'||?||'%' ESCAPE '\\' COLLATE NOCASE
      OR dtrm_rsn_cn LIKE '%'||?||'%' ESCAPE '\\' COLLATE NOCASE)`;
    clauses.push(kwOr.replace(/\s+/g, " "));
    for (let i = 0; i < 6; i++) params.push(esc);
  }

  const sql = clauses.length === 0 ? "1 = 1" : clauses.join(" AND ");
  return { sql, params };
}

export type BucketSearchResult = {
  rows: ClassificationListRow[];
  total: number;
  page: number;
  pageSize: number;
};

/** 위원회(A/B/C)별로 각각 카운트·페이지네이션 */
export function searchClassificationCasesGrouped(
  db: DatabaseSync,
  q: GroupedClassificationQuery,
): Partial<Record<CommitteeBucketCode, BucketSearchResult>> {
  const partial: Partial<Record<CommitteeBucketCode, BucketSearchResult>> = {};
  for (const bucket of q.buckets) {
    const page = Math.max(1, Math.floor(Number(q.bucketPages[bucket])) || 1);
    const merged: ClassificationSearchBody = {
      ...q.filters,
      committeeType: bucket,
      page,
      pageSize: q.pageSize,
    };
    partial[bucket] = searchClassificationCases(db, merged);
  }
  return partial;
}

export function searchClassificationCases(
  db: DatabaseSync,
  body: ClassificationSearchBody,
): {
  rows: ClassificationListRow[];
  total: number;
  page: number;
  pageSize: number;
} {
  const { sql: whereSql, params: whereParams } = buildWhere(body);

  const countSt = db.prepare(
    `SELECT COUNT(*) AS c FROM classification_cases WHERE ${whereSql}`,
  );
  const countRow = countSt.get(...whereParams) as { c: number } | undefined;
  const total = Number(countRow?.c ?? 0);

  const page = body.page ?? 1;
  const pageSize = body.pageSize ?? 10;
  const offset = (page - 1) * pageSize;

  const listSt = db.prepare(
    `SELECT id, committee_type, committee_name, rrdc_no, reff_no, enfr_dt, cstm_nm, dtrm_hs_sgn, cmdt_nm, imge_cnt
     FROM classification_cases
     WHERE ${whereSql}
     ORDER BY (CASE WHEN enfr_dt IS NULL OR enfr_dt = '' THEN 1 ELSE 0 END),
              enfr_dt DESC,
              id DESC
     LIMIT ? OFFSET ?`,
  );
  const rows = listSt.all(...whereParams, pageSize, offset) as ClassificationListRow[];

  return { rows, total, page, pageSize };
}

export type ClassificationCaseDetail = Record<string, unknown>;

export type CaseImageMetaRow = {
  id: number;
  image_seq: number;
  attch_file_id: string;
  content_type: string | null;
  image_size: number | null;
  download_status: string;
  error_msg: string | null;
};

export function getClassificationCaseById(
  db: DatabaseSync,
  id: number,
): ClassificationCaseDetail | undefined {
  const st = db.prepare(`SELECT * FROM classification_cases WHERE id = ?`);
  const row = st.get(id) as ClassificationCaseDetail | undefined;
  return row;
}

export function listCaseImagesMeta(
  db: DatabaseSync,
  caseRowId: number,
): CaseImageMetaRow[] {
  const st = db.prepare(
    `SELECT id, image_seq, attch_file_id, content_type, image_size, download_status, error_msg
     FROM case_images
     WHERE case_id = ?
     ORDER BY image_seq ASC, id ASC`,
  );
  return st.all(caseRowId) as CaseImageMetaRow[];
}

function blobToBuffer(
  data: unknown,
): Buffer | null {
  if (data === null || data === undefined) return null;
  if (Buffer.isBuffer(data) && data.byteLength > 0) return data;
  if (
    typeof data === "object" &&
    data !== null &&
    data instanceof Uint8Array &&
    data.byteLength > 0
  ) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }
  return null;
}

/** `case_images.id` 행 바이너리 (내 사건에 속한 행만) */
export function getCaseImageBlobForCase(
  db: DatabaseSync,
  imageRowId: number,
  caseRowId: number,
): { contentType: string; buf: Buffer } | null {
  const st = db.prepare(
    `SELECT image_data, content_type FROM case_images WHERE id = ? AND case_id = ?`,
  );
  const row = st.get(imageRowId, caseRowId) as {
    image_data?: unknown;
    content_type?: string | null;
  } | undefined;
  const buf = row ? blobToBuffer(row.image_data) : null;
  if (!buf) return null;
  const contentType =
    (row?.content_type && row.content_type.trim()) || "application/octet-stream";
  return { contentType, buf };
}
