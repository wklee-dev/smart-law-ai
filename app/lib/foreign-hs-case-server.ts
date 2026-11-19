import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  FOREIGN_HS_BUCKET_ORDER,
  type ForeignHsBucketCode,
} from "@/app/lib/foreign-hs-case-buckets";
import {
  FOREIGN_KEYWORD_SEARCH_COLUMNS,
  foreignListPreviewKind,
} from "@/app/lib/foreign-hs-case-display";
import {
  getForeignHsCaseAttachRoot,
  getForeignHsCaseDbPath,
} from "@/app/lib/foreign-hs-case-paths";
import type {
  ForeignBucketSearchResult,
  ForeignCaseListRow,
} from "@/app/lib/foreign-hs-case-types";

export type { ForeignBucketSearchResult, ForeignCaseListRow } from "@/app/lib/foreign-hs-case-types";

export type ForeignHsDb = DatabaseSync;

/** UI 탭 버킷: `tab_country_code` 우선, 없으면 `country_code` */
export const FOREIGN_CASE_BUCKET_SQL = `UPPER(TRIM(COALESCE(NULLIF(TRIM(tab_country_code), ''), country_code)))`;

/** LIKE 에서 `\`, `%`, `_` 이스케이프 */
export function escapeSqlLike(pattern: string): string {
  return pattern.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export function openForeignHsCaseDb(): DatabaseSync {
  const p = getForeignHsCaseDbPath();
  if (!fs.existsSync(p)) {
    throw new Error(`품목분류 외국사례 DB 파일이 없습니다: ${p}`);
  }
  return new DatabaseSync(p, { readOnly: true });
}

export type ForeignCaseFiltersOnly = {
  enforce_date_from?: string;
  enforce_date_to?: string;
  ref_no?: string;
  hs_code?: string;
  keyword?: string;
};

export type GroupedForeignQuery = {
  filters: ForeignCaseFiltersOnly;
  buckets: ForeignHsBucketCode[];
  bucketPages: Partial<Record<ForeignHsBucketCode, number>>;
  pageSize: number;
};

function trimOrUndef(s: unknown): string | undefined {
  if (typeof s !== "string") return undefined;
  const t = s.trim();
  return t.length === 0 ? undefined : t;
}

function previewExpr(column: string): string {
  return `CASE WHEN length(COALESCE(${column},'')) > 220
    THEN SUBSTR(COALESCE(${column},''), 1, 217) || '…'
    ELSE COALESCE(${column},'') END`;
}

/** 텍스트·날짜 범위·검색어 중 하나 이상 */
export function hasForeignSearchCriterion(body: ForeignCaseFiltersOnly): boolean {
  const fields = [
    body.ref_no,
    body.hs_code,
    body.keyword,
    body.enforce_date_from,
    body.enforce_date_to,
  ];
  return fields.some((v) => typeof v === "string" && v.trim().length > 0);
}

export function foreignFiltersFromInput(input: Record<string, unknown>): ForeignCaseFiltersOnly {
  return {
    enforce_date_from: trimOrUndef(input.enforce_date_from),
    enforce_date_to: trimOrUndef(input.enforce_date_to),
    ref_no: trimOrUndef(input.ref_no),
    hs_code: trimOrUndef(input.hs_code),
    keyword: trimOrUndef(input.keyword),
  };
}

export function parseForeignBucketsInput(input: unknown): ForeignHsBucketCode[] {
  if (!Array.isArray(input)) return [...FOREIGN_HS_BUCKET_ORDER];
  const allow = new Set<string>(FOREIGN_HS_BUCKET_ORDER);
  const seen = new Set<string>();
  const out: ForeignHsBucketCode[] = [];
  for (const x of input) {
    const u = typeof x === "string" ? x.trim().toUpperCase() : "";
    if (allow.has(u) && !seen.has(u)) {
      seen.add(u);
      out.push(u as ForeignHsBucketCode);
    }
  }
  return out.length ? out : [...FOREIGN_HS_BUCKET_ORDER];
}

export function parseForeignBucketPagesInput(
  input: unknown,
  buckets: ForeignHsBucketCode[],
): Partial<Record<ForeignHsBucketCode, number>> {
  const raw =
    typeof input === "object" && input !== null
      ? (input as Record<string, unknown>)
      : {};
  const out: Partial<Record<ForeignHsBucketCode, number>> = {};
  for (const b of buckets) {
    const n = Number(raw[b]);
    out[b] = Math.max(1, Number.isFinite(n) && Number.isInteger(n) ? n : 1);
  }
  return out;
}

export function parseForeignGroupedBody(
  input: Record<string, unknown>,
): { ok: true; q: GroupedForeignQuery } | { ok: false; error: string } {
  const filters = foreignFiltersFromInput(input);
  if (!hasForeignSearchCriterion(filters)) {
    return { ok: false, error: "조회 조건을 한 가지 이상 입력하세요." };
  }
  const pageSizeRaw = Number(input.pageSize) || 10;
  const pageSize = Math.min(100, Math.max(5, Math.floor(pageSizeRaw)));
  const buckets = parseForeignBucketsInput(input.buckets);
  const bucketPages = parseForeignBucketPagesInput(input.bucketPages, buckets);
  return { ok: true, q: { filters, buckets, bucketPages, pageSize } };
}

function buildForeignWhere(filters: ForeignCaseFiltersOnly): {
  sql: string;
  params: unknown[];
} {
  const clauses: string[] = [];
  const params: unknown[] = [];

  const bindLike = (column: string, value: string | undefined): void => {
    if (!value) return;
    const esc = escapeSqlLike(value);
    clauses.push(
      `${column} LIKE '%' || ? || '%' ESCAPE '\\' COLLATE NOCASE`,
    );
    params.push(esc);
  };

  bindLike("ref_no", filters.ref_no);
  bindLike("hs_code", filters.hs_code);

  if (filters.enforce_date_from) {
    clauses.push("(enforce_date IS NOT NULL AND enforce_date >= ?)");
    params.push(filters.enforce_date_from);
  }
  if (filters.enforce_date_to) {
    clauses.push("(enforce_date IS NOT NULL AND enforce_date <= ?)");
    params.push(filters.enforce_date_to);
  }

  if (filters.keyword) {
    const esc = escapeSqlLike(filters.keyword);
    const cond = FOREIGN_KEYWORD_SEARCH_COLUMNS.map(
      (c) => `${c} LIKE '%'||?||'%' ESCAPE '\\' COLLATE NOCASE`,
    ).join(" OR ");
    clauses.push(`(${cond})`);
    for (let i = 0; i < FOREIGN_KEYWORD_SEARCH_COLUMNS.length; i++)
      params.push(esc);
  }

  const sql = clauses.length === 0 ? "1 = 1" : clauses.join(" AND ");
  return { sql, params };
}

export function searchForeignCasesForBucket(
  db: DatabaseSync,
  filters: ForeignCaseFiltersOnly,
  bucket: ForeignHsBucketCode,
  page: number,
  pageSize: number,
): ForeignBucketSearchResult {
  const { sql: whereSql, params: whereParams } = buildForeignWhere(filters);
  const bucketWhere = `${FOREIGN_CASE_BUCKET_SQL} = ?`;
  const fullWhere = `(${whereSql}) AND (${bucketWhere})`;
  const baseParams = [...whereParams, bucket];

  const countSt = db.prepare(
    `SELECT COUNT(*) AS c FROM foreign_cases WHERE ${fullWhere}`,
  );
  const countRow = countSt.get(...baseParams) as { c: number } | undefined;
  const total = Number(countRow?.c ?? 0);

  const safePage = Math.max(1, Math.floor(page) || 1);
  const offset = (safePage - 1) * pageSize;

  const previewKind = foreignListPreviewKind(bucket);
  let pOrg: string;
  let pEng: string;
  let pKor: string;
  if (previewKind === "goods_name") {
    const p = previewExpr("goods_name");
    pOrg = p;
    pEng = p;
    pKor = p;
  } else {
    const prefix = previewKind === "reply" ? "reply" : "goods_desc";
    pOrg = previewExpr(`${prefix}_org`);
    pEng = previewExpr(`${prefix}_eng`);
    pKor = previewExpr(`${prefix}_kor`);
  }

  const listSt = db.prepare(
    `SELECT id, prlst_clsf_srno, country, enforce_date, ref_no, hs_code,
            CAST(COALESCE(image_count, 0) AS INTEGER) AS image_count,
            ${pOrg} AS goods_preview_org,
            ${pEng} AS goods_preview_eng,
            ${pKor} AS goods_preview_kor
     FROM foreign_cases
     WHERE ${fullWhere}
     ORDER BY (CASE WHEN enforce_date IS NULL OR enforce_date = '' THEN 1 ELSE 0 END),
              enforce_date DESC,
              id DESC
     LIMIT ? OFFSET ?`,
  );
  const rows = listSt.all(
    ...baseParams,
    pageSize,
    offset,
  ) as ForeignCaseListRow[];

  return {
    rows,
    total,
    page: safePage,
    pageSize,
  };
}

export function searchForeignCasesGrouped(
  db: DatabaseSync,
  q: GroupedForeignQuery,
): Partial<Record<ForeignHsBucketCode, ForeignBucketSearchResult>> {
  const partial: Partial<Record<ForeignHsBucketCode, ForeignBucketSearchResult>> =
    {};
  for (const bucket of q.buckets) {
    const page =
      Math.max(1, Math.floor(Number(q.bucketPages[bucket])) || 1);
    partial[bucket] = searchForeignCasesForBucket(
      db,
      q.filters,
      bucket,
      page,
      q.pageSize,
    );
  }
  return partial;
}

export type ForeignCaseImageRow = {
  id: number;
  case_srno: string;
  seq: number;
  image_url: string;
  local_path: string | null;
};

export function getForeignCaseBySrno(
  db: DatabaseSync,
  srno: string,
): Record<string, unknown> | undefined {
  const st = db.prepare(`SELECT * FROM foreign_cases WHERE prlst_clsf_srno = ?`);
  const row = st.get(srno.trim()) as Record<string, unknown> | undefined;
  return row ?? undefined;
}

export function listForeignCaseImagesBySrno(
  db: DatabaseSync,
  srno: string,
): ForeignCaseImageRow[] {
  const st = db.prepare(
    `SELECT id, case_srno, seq, image_url, local_path
     FROM foreign_case_images
     WHERE case_srno = ?
     ORDER BY seq ASC, id ASC`,
  );
  return st.all(srno.trim()) as ForeignCaseImageRow[];
}

/**
 * 로컬 이미지의 절대 경로 (attach root 밖 또는 없는 파일은 null).
 */
export function resolveForeignCaseImageLocalFile(
  localPathRaw: string | null | undefined,
  attachRoot?: string,
): { absPath: string } | null {
  const root = attachRoot ?? getForeignHsCaseAttachRoot();
  const t = (localPathRaw ?? "").trim();
  if (!t) return null;

  let resolved: string;
  const norm = path.normalize(t);
  const segments = norm.split(/[/\\]/);
  if (segments.some((s) => s === "..")) return null;

  if (path.isAbsolute(norm)) resolved = path.resolve(norm);
  else resolved = path.resolve(root, norm);

  const rootResolved = path.resolve(root);
  const rel = path.relative(rootResolved, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return null;
  return { absPath: resolved };
}

function guessImageContentType(filePath: string): string {
  const e = path.extname(filePath).toLowerCase();
  switch (e) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".bmp":
      return "image/bmp";
    default:
      return "application/octet-stream";
  }
}

/** `case_images.id` 행 로컬 파일 (해당 일련번호·사례 검증 후) */
export function readForeignCaseImageFileForSrno(
  db: DatabaseSync,
  imageId: number,
  srno: string,
):
  | { buf: Buffer; contentType: string }
  | null {
  const st = db.prepare(
    `SELECT ci.local_path
     FROM foreign_case_images ci
     INNER JOIN foreign_cases fc ON fc.prlst_clsf_srno = ci.case_srno
     WHERE ci.id = ?
       AND ci.case_srno = ?`,
  );
  const row = st.get(imageId, srno.trim()) as
    | { local_path?: string | null }
    | undefined;
  const localPath = row?.local_path;
  const got = resolveForeignCaseImageLocalFile(localPath);
  if (!got) return null;
  const buf = fs.readFileSync(got.absPath);
  const contentType = guessImageContentType(got.absPath);
  return { buf, contentType };
}
