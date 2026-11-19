import type { AdminRulesConfigSource } from "@/app/lib/admin-rules-paths";
import { resolveAdminAttachmentPath } from "@/app/lib/admin-rules-paths";
import {
  openAdminRulesDb,
  type AdminRulesDb,
} from "@/app/lib/admin-rules-pg";
import {
  getCatalogEntryByParam,
  getCatalogEntryByTable,
} from "@/app/lib/admin-rules-table-catalog";
import fs from "node:fs";

export { openAdminRulesDb, type AdminRulesDb };
export { getAdminRulesDbLabel } from "@/app/lib/admin-rules-pg";

const IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function isSafeSqlIdentifier(name: string): boolean {
  return IDENT.test(name);
}

/** `rule_config.param` 등 (숫자·하이픈·언더스코어 허용) */
const RULE_PARAM_SAFE = /^[a-zA-Z0-9_-]{1,128}$/;

export function isSafeRuleConfigParam(p: string): boolean {
  return RULE_PARAM_SAFE.test(p.trim());
}

async function stmtAll<T extends Record<string, unknown>>(
  db: AdminRulesDb,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return (await db.all(sql, params)) as T[];
}

async function stmtGet<T extends Record<string, unknown>>(
  db: AdminRulesDb,
  sql: string,
  params: unknown[] = [],
): Promise<T | undefined> {
  return (await db.get(sql, params)) as T | undefined;
}

export async function tableExists(
  db: AdminRulesDb,
  name: string,
): Promise<boolean> {
  if (!isSafeSqlIdentifier(name)) return false;
  if (db.dialect === "sqlite") {
    const row = await stmtGet(
      db,
      "SELECT 1 AS o FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1",
      [name],
    );
    return !!row;
  }
  const row = await stmtGet(
    db,
    `SELECT 1 AS o FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = ? LIMIT 1`,
    [name],
  );
  return !!row;
}

/**
 * `admin_rule` / `admin_rule_addendum` / `admin_rule_annex` / `admin_rule_attachment`
 * vs `raw_rule*` — `rule_config.gubun`·URL을 보며 구분합니다. 기본은 행정규칙(admin).
 * 실제 행 존재 여부는 `resolveAdminRulesSourceFamily(db, source)`를 사용하세요.
 */
export function adminRulesSourceFamily(
  source: Pick<AdminRulesConfigSource, "gubun" | "category" | "url">,
): "admin" | "law" {
  const g = (source.gubun ?? "").trim().toLowerCase();
  /** rule_config.gubun 이 본문 테이블명과 같을 때 (예: admin_rule, raw_rule) */
  if (g === "raw_rule" || g.startsWith("raw_rule_")) {
    return "law";
  }
  if (g === "adm_rule" || g === "admin_rule" || g.startsWith("admin_rule_")) {
    return "admin";
  }
  if (
    g.includes("법령") ||
    g === "law" ||
    g === "statute" ||
    rawLikeGubun(g)
  ) {
    return "law";
  }
  if (
    g.includes("행정규칙") ||
    g === "admin" ||
    g === "adm" ||
    g.includes("행정")
  ) {
    return "admin";
  }
  const c = (source.category ?? "").trim().toLowerCase();
  const u = source.url ?? "";
  if (
    c.includes("법령") ||
    c === "law" ||
    c.includes("statute") ||
    u.includes("/법령/")
  ) {
    return "law";
  }
  if (u.includes("/행정규칙/")) {
    return "admin";
  }
  return "admin";
}

/**
 * SQLite에 실제 본문·부칙·별표가 있는 쪽을 우선한다.
 * (예: gubun=law 이지만 raw_rule → admin_rule 이관된 경우)
 */
export async function resolveAdminRulesSourceFamily(
  db: AdminRulesDb,
  source: AdminRulesConfigSource,
): Promise<"admin" | "law"> {
  let col: string;
  let key: string;
  try {
    col = adminRulesRowFilterColumn();
    key = adminRulesRowKeyValue(source);
  } catch {
    return adminRulesSourceFamily(source);
  }
  const adminT = adminRulesUnifiedTableNames("admin");
  const lawT = adminRulesUnifiedTableNames("law");
  const inAdmin =
    (await hasKeyedRows(db, adminT.main, col, key)) ||
    (await hasKeyedRows(db, adminT.addendum, col, key)) ||
    (await hasKeyedRows(db, adminT.annex, col, key));
  const inLaw =
    (await hasKeyedRows(db, lawT.main, col, key)) ||
    (await hasKeyedRows(db, lawT.addendum, col, key)) ||
    (await hasKeyedRows(db, lawT.annex, col, key));

  if (inAdmin && !inLaw) return "admin";
  if (inLaw && !inAdmin) return "law";
  /** 양쪽 모두 있거나 둘 다 없으면 메타(gubun) 기준. 양쪽이면 admin(이관 대상) 우선 */
  if (inAdmin && inLaw) return "admin";
  return adminRulesSourceFamily(source);
}

/** `gubun` 값이 `raw` 단독인 경우 등 */
function rawLikeGubun(g: string): boolean {
  return g === "raw";
}

export function adminRulesUnifiedTableNames(family: "admin" | "law"): {
  main: string;
  addendum: string;
  annex: string;
  attachment: string;
} {
  const prefix = family === "law" ? "raw_rule" : "admin_rule";
  return {
    main: prefix,
    addendum: `${prefix}_addendum`,
    annex: `${prefix}_annex`,
    attachment: `${prefix}_attachment`,
  };
}

/** 통합 테이블 행 구분 컬럼·값 — 기본 `param`(admin_rule·raw_rule 등과 rule_config.param 대응). 첨부 디스크 경로는 API의 `table`(rule_config.table_name)을 그대로 씀. */
export function adminRulesRowFilterColumn(): string {
  const c = process.env.ADMIN_RULES_ROW_KEY_COLUMN?.trim() || "param";
  if (!isSafeSqlIdentifier(c)) {
    throw new Error("ADMIN_RULES_ROW_KEY_COLUMN must be a safe SQL identifier");
  }
  return c;
}

export function adminRulesRowKeyValue(source: AdminRulesConfigSource): string {
  const field = process.env.ADMIN_RULES_ROW_KEY_FIELD?.trim() || "param";
  if (field === "param") return source.param;
  if (field === "table_name") return source.table_name;
  throw new Error('ADMIN_RULES_ROW_KEY_FIELD must be "param" or "table_name"');
}

async function hasKeyedRows(
  db: AdminRulesDb,
  table: string,
  column: string,
  key: string,
): Promise<boolean> {
  if (!(await tableExists(db, table))) return false;
  const row = await stmtGet<Record<string, unknown>>(
    db,
    `SELECT 1 AS o FROM "${table}" WHERE "${column}" = ? LIMIT 1`,
    [key],
  );
  return !!row;
}

/** 부칙·별표·첨부: 해당 소스 키가 존재하는지 */
export async function adminRulesSatelliteTablePresence(
  db: AdminRulesDb,
  source: AdminRulesConfigSource,
): Promise<{ addendum: boolean; annex: boolean; attachment: boolean } | null> {
  // 통합 테이블(admin_rule 등)은 param 키로 조회한다. table_name이 숫자(예: 100)여도 허용.
  let col: string;
  let key: string;
  try {
    col = adminRulesRowFilterColumn();
    key = adminRulesRowKeyValue(source);
  } catch {
    return null;
  }
  if (!isSafeRuleConfigParam(key)) return null;
  const family = await resolveAdminRulesSourceFamily(db, source);
  const t = adminRulesUnifiedTableNames(family);
  return {
    addendum: await hasKeyedRows(db, t.addendum, col, key),
    annex: await hasKeyedRows(db, t.annex, col, key),
    attachment: await hasKeyedRows(db, t.attachment, col, key),
  };
}

export async function adminRulesHasRenderableContent(
  db: AdminRulesDb,
  source: AdminRulesConfigSource,
): Promise<boolean> {
  const family = await resolveAdminRulesSourceFamily(db, source);
  const t = adminRulesUnifiedTableNames(family);
  let col: string;
  let key: string;
  try {
    col = adminRulesRowFilterColumn();
    key = adminRulesRowKeyValue(source);
  } catch {
    return false;
  }
  return (
    (await hasKeyedRows(db, t.main, col, key)) ||
    (await hasKeyedRows(db, t.addendum, col, key)) ||
    (await hasKeyedRows(db, t.annex, col, key))
  );
}

export type AdminRulesArticleRow = {
  id: number;
  section_type: string;
  article_no: string;
  article_title: string;
  article_content: string;
};

export type AdminRulesChapterOut = {
  id: string;
  title: string;
  articles: AdminRulesArticleRow[];
};

export type AdminRulesAddendumGroupOut = {
  key: string;
  header: string;
  rows: { article_no: string; article_content: string }[];
};

export type AdminRulesAnnexFileOut = {
  /** admin_rule_attachment.id — 로컬 파일 API용 (없으면 0) */
  attachmentId: number;
  flSeq: string;
  fileName: string;
  fileType: string;
  kind: "han" | "pdf" | "image";
  /** annex_hwp | annex_pdf | annex_image 등 */
  role: string;
  /** downloaded=1 이고 attach_dir 하위 파일이 존재할 때 */
  availableLocally: boolean;
  /** 원본 다운로드 URL (로컬 없거나 downloaded=0일 때 사용). local_path는 절대 포함하지 않음 */
  downloadUrl: string;
};

export type AdminRulesAnnexOut = {
  id: number;
  bylSeq: string;
  title: string;
  annexContent: string;
  files: AdminRulesAnnexFileOut[];
};

/** `article_image` — 조문 본문에 삽입된 이미지(BLOB) */
export type AdminRulesArticleImageOut = {
  id: number;
  article_no: string;
  fl_seq: string;
  img_order: number;
  mime_type: string;
  file_ext: string;
  /** 브라우저 표시용 API 경로 */
  display_src: string;
};

export type AdminRulesDocumentOut = {
  tableName: string;
  lawName: string;
  promulgationNo: string;
  promulgationDate: string;
  /** 본문 테이블 `seq_id` */
  seqId: string;
  lawUrl: string;
  chapters: AdminRulesChapterOut[];
  looseArticles: AdminRulesArticleRow[];
  addendumGroups: AdminRulesAddendumGroupOut[];
  annexes: AdminRulesAnnexOut[];
  /** 조문번호별 이미지 (`article_image`) */
  articleImages: AdminRulesArticleImageOut[];
  /** `rule_config.table_name` 기준 SQLite 테이블 존재 여부 */
  tablePresence: {
    body: boolean;
    addendum: boolean;
    annex: boolean;
    attachment: boolean;
    article_image: boolean;
  };
  /** 첨부·파일 API param (별표 위임 시 호스트 규칙) */
  fileContentParam?: string;
  satelliteAnnexHost?: {
    param: string;
    description: string;
    matchedAnnexCount: number;
  };
};

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string" && v.trim()) return Number(v);
  return 0;
}

function str(v: unknown): string {
  if (v == null) return "";
  return String(v);
}

/** law.go.kr 별표 제목 등에 남는 `&lt;` / `&gt;` 등을 평문으로 복원 */
export function decodeAdminRulesHtmlEntities(raw: string): string {
  return raw
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&");
}

/** 스키마에 따른 컬럼명 대소문자 차이 흡수 */
function pick(row: Record<string, unknown>, ...candidates: string[]): unknown {
  for (const key of candidates) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      const v = row[key];
      if (v !== undefined) return v;
    }
  }
  const lower = new Map<string, unknown>();
  for (const [k, v] of Object.entries(row)) {
    lower.set(k.toLowerCase(), v);
  }
  for (const key of candidates) {
    const v = lower.get(key.toLowerCase());
    if (v !== undefined) return v;
  }
  return undefined;
}

async function tableColumnNamesLower(
  db: AdminRulesDb,
  table: string,
): Promise<Set<string>> {
  if (!isSafeSqlIdentifier(table)) return new Set();
  const rows =
    db.dialect === "sqlite"
      ? await stmtAll<Record<string, unknown>>(
          db,
          `PRAGMA table_info("${table}")`,
        )
      : await stmtAll<Record<string, unknown>>(
          db,
          `SELECT column_name AS name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ?`,
          [table],
        );
  const out = new Set<string>();
  for (const r of rows) {
    const n = pick(r, "name", "NAME");
    if (n != null && String(n).trim()) {
      out.add(String(n).toLowerCase());
    }
  }
  return out;
}

/** 규칙 메타 테이블 — 신규 `rule_master` 우선, 구버전 `rule_config` 폴백 */
export async function getAdminRulesMetaTableName(db: AdminRulesDb): Promise<string | null> {
  if (await tableExists(db, "rule_master")) return "rule_master";
  if (await tableExists(db, "rule_config")) return "rule_config";
  return null;
}

function optionalMetaText(v: unknown): string | undefined {
  if (v == null) return undefined;
  const t = String(v).trim();
  return t.length > 0 ? t : undefined;
}

function mapAdminRulesConfigRow(
  r: Record<string, unknown>,
  metaTable: "rule_master" | "rule_config",
): AdminRulesConfigSource {
  const param = str(pick(r, "param", "PARAM"));
  const gubun =
    optionalMetaText(pick(r, "gubun", "GUBUN")) ??
    optionalMetaText(pick(r, "url_type", "URL_TYPE"));
  const tableName =
    metaTable === "rule_master"
      ? param
      : str(pick(r, "table_name", "TABLE_NAME")) || param;
  const category =
    metaTable === "rule_master"
      ? optionalMetaText(pick(r, "reference", "REFERENCE"))
      : optionalMetaText(pick(r, "category", "CATEGORY"));
  return {
    param,
    gubun,
    table_name: tableName,
    description: str(pick(r, "description", "DESCRIPTION")),
    url: str(pick(r, "url", "URL")),
    note: optionalMetaText(pick(r, "note", "NOTE")),
    category,
  };
}

/** `rule_master` / `rule_config` 전체 행 → 소스 목록 */
export async function loadRuleConfigSources(db: AdminRulesDb): Promise<AdminRulesConfigSource[]> {
  const metaTable = await getAdminRulesMetaTableName(db);
  if (!metaTable) return [];
  if (metaTable === "rule_master") {
    const rows = await stmtAll<Record<string, unknown>>(
      db,
      `SELECT gubun, param, description, note, reference, url, url_type
       FROM rule_master ORDER BY param`,
    );
    return rows.map((r) => mapAdminRulesConfigRow(r, "rule_master"));
  }
  const rows = await stmtAll<Record<string, unknown>>(
    db,
    `SELECT param, gubun, table_name, description, url, note, category
     FROM rule_config ORDER BY param`,
  );
  return rows.map((r) => mapAdminRulesConfigRow(r, "rule_config"));
}

/** 메타 테이블 유무·행 수 (목록 0건일 때 원인 표시용) */
export async function getAdminRulesRuleConfigDiagnostics(db: AdminRulesDb): Promise<{
  rule_config_table_exists: boolean;
  rule_config_row_count: number;
  meta_table_name: string | null;
}> {
  const metaTable = await getAdminRulesMetaTableName(db);
  if (!metaTable) {
    return {
      rule_config_table_exists: false,
      rule_config_row_count: 0,
      meta_table_name: null,
    };
  }
  const row = await stmtGet<Record<string, unknown>>(
    db,
    `SELECT COUNT(*) AS c FROM "${metaTable}"`,
  );
  return {
    rule_config_table_exists: true,
    rule_config_row_count: row ? num(pick(row, "c", "C")) : 0,
    meta_table_name: metaTable,
  };
}

/** 첨부 디스크 경로 슬러그 — `ATTACH/{param}/` */
export function adminRulesAttachSlug(
  source: Pick<AdminRulesConfigSource, "param" | "table_name">,
): string {
  return source.param.trim() || source.table_name;
}

export async function getSourceMetaFromDb(
  db: AdminRulesDb,
  tableName: string,
): Promise<AdminRulesConfigSource | undefined> {
  const metaTable = await getAdminRulesMetaTableName(db);
  if (!metaTable) return undefined;

  if (metaTable === "rule_master") {
    // rule_master에는 별도 table_name이 없고 param이 키(숫자 가능)
    if (isSafeRuleConfigParam(tableName)) {
      const byParam = await getSourceMetaFromDbByParam(db, tableName);
      if (byParam) return byParam;
    }
    if (!isSafeSqlIdentifier(tableName)) return undefined;
    const catalog =
      getCatalogEntryByTable(tableName) ?? getCatalogEntryByParam(tableName);
    if (catalog) return await getSourceMetaFromDbByParam(db, catalog.param);
    return undefined;
  }

  // rule_config.table_name은 레거시 테이블명 또는 param 대용(숫자)일 수 있음
  if (
    !isSafeSqlIdentifier(tableName) &&
    !isSafeRuleConfigParam(tableName)
  ) {
    return undefined;
  }

  const row = await stmtGet<Record<string, unknown>>(
    db,
    `SELECT param, gubun, table_name, description, url, note, category
     FROM rule_config WHERE table_name = ? LIMIT 1`,
    [tableName],
  );
  if (!row) return undefined;
  return mapAdminRulesConfigRow(row, "rule_config");
}

export async function getSourceMetaFromDbByParam(
  db: AdminRulesDb,
  param: string,
): Promise<AdminRulesConfigSource | undefined> {
  if (!isSafeRuleConfigParam(param)) return undefined;
  const metaTable = await getAdminRulesMetaTableName(db);
  if (!metaTable) return undefined;

  if (metaTable === "rule_master") {
    const row = await stmtGet<Record<string, unknown>>(
      db,
      `SELECT gubun, param, description, note, reference, url, url_type
       FROM rule_master WHERE param = ? LIMIT 1`,
      [param.trim()],
    );
    if (!row) return undefined;
    return mapAdminRulesConfigRow(row, "rule_master");
  }

  const row = await stmtGet<Record<string, unknown>>(
    db,
    `SELECT param, gubun, table_name, description, url, note, category
     FROM rule_config WHERE param = ? LIMIT 1`,
    [param.trim()],
  );
  if (!row) return undefined;
  return mapAdminRulesConfigRow(row, "rule_config");
}

export async function fetchAdminRulesAttachmentRow(
  db: AdminRulesDb,
  source: AdminRulesConfigSource,
  flSeq: string,
): Promise<{ file_name: string; file_type: string; local_path: string } | undefined> {
  const family = await resolveAdminRulesSourceFamily(db, source);
  const tbl = adminRulesUnifiedTableNames(family);
  const col = adminRulesRowFilterColumn();
  const key = adminRulesRowKeyValue(source);
  const row = await stmtGet<Record<string, unknown>>(
    db,
    `SELECT file_name, file_type, local_path FROM "${tbl.attachment}" WHERE fl_seq = ? AND "${col}" = ? LIMIT 1`,
    [flSeq, key],
  );
  if (!row) return undefined;
  return {
    file_name: String(row.file_name ?? ""),
    file_type: String(row.file_type ?? ""),
    local_path: String(row.local_path ?? ""),
  };
}

export type AdminRulesAttachmentById = {
  id: number;
  param: string;
  gubun: string;
  fl_seq: string;
  file_name: string;
  file_type: string;
  local_path: string;
  download_url: string;
  downloaded: number;
  attachment_role: string;
  mime_type: string;
};

/** attachment PK로 행 조회 (local_path는 서버 전용) */
export async function fetchAdminRulesAttachmentById(
  db: AdminRulesDb,
  attachmentId: number,
): Promise<AdminRulesAttachmentById | undefined> {
  if (!Number.isFinite(attachmentId) || attachmentId <= 0) return undefined;

  for (const family of ["admin", "law"] as const) {
    const tbl = adminRulesUnifiedTableNames(family);
    if (!(await tableExists(db, tbl.attachment))) continue;
    const cols = await tableColumnNamesLower(db, tbl.attachment);
    if (!cols.has("id")) continue;
    const selectRole = cols.has("attachment_role")
      ? "attachment_role"
      : "'' AS attachment_role";
    const selectMime = cols.has("mime_type") ? "mime_type" : "'' AS mime_type";
    const selectDownloaded = cols.has("downloaded")
      ? "downloaded"
      : "0 AS downloaded";
    const selectUrl = cols.has("download_url")
      ? "download_url"
      : "'' AS download_url";
    const selectGubun = cols.has("gubun") ? "gubun" : "'' AS gubun";
    const row = await stmtGet<Record<string, unknown>>(
      db,
      `SELECT id, param, ${selectGubun}, fl_seq, file_name, file_type, local_path,
              ${selectUrl}, ${selectDownloaded}, ${selectRole}, ${selectMime}
       FROM "${tbl.attachment}" WHERE id = ? LIMIT 1`,
      [attachmentId],
    );
    if (!row) continue;
    return {
      id: num(pick(row, "id", "ID")),
      param: str(pick(row, "param", "PARAM")),
      gubun: str(pick(row, "gubun", "GUBUN")),
      fl_seq: str(pick(row, "fl_seq", "FL_SEQ")),
      file_name: str(pick(row, "file_name", "FILE_NAME")),
      file_type: str(pick(row, "file_type", "FILE_TYPE")),
      local_path: str(pick(row, "local_path", "LOCAL_PATH")),
      download_url: str(pick(row, "download_url", "DOWNLOAD_URL")),
      downloaded: num(pick(row, "downloaded", "DOWNLOADED")),
      attachment_role: str(pick(row, "attachment_role", "ATTACHMENT_ROLE")),
      mime_type: str(pick(row, "mime_type", "MIME_TYPE")),
    };
  }
  return undefined;
}

function kindFromAttachmentRole(
  role: string,
  fileName: string,
  fileType: string,
): "han" | "pdf" | "image" {
  const r = role.trim().toLowerCase();
  if (r === "annex_hwp" || r === "hwp" || r === "han") return "han";
  if (r === "annex_pdf" || r === "pdf") return "pdf";
  if (r === "annex_image" || r === "image" || r === "img") return "image";
  return fileKind(fileName, fileType);
}

function roleFromKind(kind: "han" | "pdf" | "image"): string {
  if (kind === "han") return "annex_hwp";
  if (kind === "pdf") return "annex_pdf";
  return "annex_image";
}

function parseImageSeqs(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.map((x) => String(x));
  } catch {
    return [];
  }
}

function fileKind(
  fileName: string,
  fileType: string,
): "han" | "pdf" | "image" {
  const lower = `${fileName} ${fileType}`.toLowerCase();
  if (/\.(hwp|hwpx|cell|show)$/.test(lower) || /hwp/.test(lower)) {
    return "han";
  }
  if (/\.pdf$/.test(lower) || fileType.toLowerCase() === "pdf") {
    return "pdf";
  }
  if (
    /\.(png|jpe?g|gif|webp|bmp)$/.test(lower) ||
    /^(png|jpe?g|gif|webp|bmp)$/.test(fileType.toLowerCase())
  ) {
    return "image";
  }
  return /\.(png|jpe?g|gif|webp|bmp)$/.test(fileName.toLowerCase())
    ? "image"
    : "han";
}

export async function listArticleImagesForSource(
  db: AdminRulesDb,
  source: AdminRulesConfigSource,
  lawName: string,
  articleImageApiBase = "/api/admin-rules/article-image",
): Promise<AdminRulesArticleImageOut[]> {
  if (!(await tableExists(db, "article_image"))) return [];
  const col = adminRulesRowFilterColumn();
  const key = adminRulesRowKeyValue(source);
  const law = lawName.trim();
  const rows = await stmtAll<Record<string, unknown>>(
    db,
    `SELECT id, article_no, fl_seq, img_order, mime_type, file_ext
     FROM article_image
     WHERE "${col}" = ?
        OR (? != '' AND law_name = ?)
     ORDER BY article_no, img_order, id`,
    [key, law, law],
  );
  return rows.map((r) => {
    const flSeq = str(pick(r, "fl_seq", "FL_SEQ"));
    const q = new URLSearchParams({ param: key, flSeq });
    return {
      id: num(pick(r, "id", "ID")),
      article_no: str(pick(r, "article_no", "ARTICLE_NO")),
      fl_seq: flSeq,
      img_order: num(pick(r, "img_order", "IMG_ORDER")) || 1,
      mime_type: str(pick(r, "mime_type", "MIME_TYPE")) || "image/png",
      file_ext: str(pick(r, "file_ext", "FILE_EXT")) || "png",
      display_src: `${articleImageApiBase}?${q.toString()}`,
    };
  });
}

export async function readArticleImageBlobForParam(
  db: AdminRulesDb,
  param: string,
  flSeq: string,
): Promise<{ buf: Buffer; mimeType: string } | null> {
  if (!(await tableExists(db, "article_image"))) return null;
  const col = adminRulesRowFilterColumn();
  const row = await stmtGet<Record<string, unknown>>(
    db,
    `SELECT image_data, mime_type, file_ext
     FROM article_image
     WHERE "${col}" = ? AND fl_seq = ?
     LIMIT 1`,
    [param.trim(), flSeq.trim()],
  );
  if (!row) return null;
  const raw = pick(row, "image_data", "IMAGE_DATA");
  if (raw == null) return null;
  let buf: Buffer;
  if (Buffer.isBuffer(raw)) buf = raw;
  else if (raw instanceof Uint8Array) buf = Buffer.from(raw);
  else if (typeof raw === "string") buf = Buffer.from(raw, "binary");
  else return null;
  if (buf.length === 0) return null;
  const mimeType =
    str(pick(row, "mime_type", "MIME_TYPE")).trim() ||
    guessArticleImageMime(str(pick(row, "file_ext", "FILE_EXT")));
  return { buf, mimeType };
}

function guessArticleImageMime(fileExt: string): string {
  const e = fileExt.trim().toLowerCase().replace(/^\./, "");
  switch (e) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "bmp":
      return "image/bmp";
    case "png":
    default:
      return "image/png";
  }
}

export async function buildAdminRulesSatelliteAnnexDocument(
  db: AdminRulesDb,
  viewerSource: AdminRulesConfigSource,
  hostSource: AdminRulesConfigSource,
  annexIds: number[],
  options?: { articleImageApiBase?: string },
): Promise<AdminRulesDocumentOut> {
  const allow = new Set(annexIds);
  const hostDoc = await buildAdminRulesDocument(db, hostSource, options);
  const annexes = hostDoc.annexes.filter((a) => allow.has(a.id));
  return {
    ...hostDoc,
    tableName: viewerSource.table_name,
    lawName: viewerSource.description,
    lawUrl: viewerSource.url,
    chapters: [],
    looseArticles: [],
    addendumGroups: [],
    annexes,
    articleImages: [],
    tablePresence: {
      body: false,
      addendum: false,
      annex: annexes.length > 0,
      attachment: hostDoc.tablePresence.attachment,
      article_image: false,
    },
    fileContentParam: hostSource.param,
    satelliteAnnexHost: {
      param: hostSource.param,
      description: hostSource.description,
      matchedAnnexCount: annexes.length,
    },
  };
}

export async function buildAdminRulesDocument(
  db: AdminRulesDb,
  source: AdminRulesConfigSource,
  options?: { articleImageApiBase?: string },
): Promise<AdminRulesDocumentOut> {
  // 본문은 통합 테이블(admin_rule/raw_rule) + param 키로 조회한다.
  // rule_master에서는 table_name≡param 이라 숫자(예: "100")가 올 수 있으므로
  // SQL 식별자 검사가 아니라 param 안전 검사를 한다.
  const col = adminRulesRowFilterColumn();
  const key = adminRulesRowKeyValue(source);
  if (!isSafeRuleConfigParam(key)) {
    throw new Error(`유효하지 않은 규칙 키(${col}) 입니다: ${key}`);
  }
  const family = await resolveAdminRulesSourceFamily(db, source);
  const tbl = adminRulesUnifiedTableNames(family);
  const tablePresence = {
    body: await hasKeyedRows(db, tbl.main, col, key),
    addendum: await hasKeyedRows(db, tbl.addendum, col, key),
    annex: await hasKeyedRows(db, tbl.annex, col, key),
    attachment: await hasKeyedRows(db, tbl.attachment, col, key),
    article_image: await tableExists(db, "article_image"),
  };

  const rawMain = await stmtAll<Record<string, unknown>>(
    db,
    `SELECT id, section_type, article_no, article_title, article_content
     FROM "${tbl.main}" WHERE "${col}" = ? ORDER BY id`,
    [key],
  );
  const mainRows: AdminRulesArticleRow[] = rawMain.map((r) => ({
    id: num(r.id),
    section_type: str(r.section_type),
    article_no: str(r.article_no),
    article_title: str(r.article_title),
    article_content: str(r.article_content),
  }));

  const chapters: AdminRulesChapterOut[] = [];
  let looseArticles: AdminRulesArticleRow[] = [];
  let current: AdminRulesChapterOut | null = null;

  for (const row of mainRows) {
    if (row.section_type === "장절") {
      current = {
        id: `ch-${row.id}`,
        title: row.article_title || row.article_no || "장",
        articles: [],
      };
      chapters.push(current);
    } else if (row.section_type === "조문") {
      if (current) current.articles.push(row);
      else looseArticles.push(row);
    } else {
      if (current) current.articles.push(row);
      else looseArticles.push(row);
    }
  }

  const mainColSet = await tableColumnNamesLower(db, tbl.main);
  const metaCols: string[] = [];
  for (const c of ["law_name", "promulgation_no", "promulgation_dt"]) {
    if (mainColSet.has(c)) metaCols.push(`"${c}"`);
  }
  if (mainColSet.has("seq_id")) metaCols.push('"seq_id"');

  const firstRaw =
    metaCols.length > 0
      ? await stmtGet<Record<string, unknown>>(
          db,
          `SELECT ${metaCols.join(", ")} FROM "${tbl.main}" WHERE "${col}" = ? ORDER BY id LIMIT 1`,
          [key],
        )
      : undefined;
  let firstFull = firstRaw
    ? {
        law_name: str(pick(firstRaw, "law_name", "LAW_NAME")),
        promulgation_no: str(pick(firstRaw, "promulgation_no", "PROMULGATION_NO")),
        promulgation_dt: str(pick(firstRaw, "promulgation_dt", "PROMULGATION_DT")),
        seq_id: str(pick(firstRaw, "seq_id", "SEQ_ID")),
      }
    : undefined;

  if (!firstFull && tablePresence.addendum) {
    const addColSet = await tableColumnNamesLower(db, tbl.addendum);
    const addMetaCols: string[] = [];
    for (const c of ["law_name", "promulgation_no", "promulgation_dt"]) {
      if (addColSet.has(c)) addMetaCols.push(`"${c}"`);
    }
    if (addColSet.has("seq_id")) addMetaCols.push('"seq_id"');
    if (addMetaCols.length > 0) {
      const row = await stmtGet<Record<string, unknown>>(
        db,
        `SELECT ${addMetaCols.join(", ")} FROM "${tbl.addendum}" WHERE "${col}" = ? ORDER BY id LIMIT 1`,
        [key],
      );
      if (row) {
        firstFull = {
          law_name: str(pick(row, "law_name", "LAW_NAME")),
          promulgation_no: str(pick(row, "promulgation_no", "PROMULGATION_NO")),
          promulgation_dt: str(pick(row, "promulgation_dt", "PROMULGATION_DT")),
          seq_id: str(pick(row, "seq_id", "SEQ_ID")),
        };
      }
    }
  }

  const addendumGroups: AdminRulesAddendumGroupOut[] = [];
  if (tablePresence.addendum) {
    const addRaw = await stmtAll<Record<string, unknown>>(
      db,
      `SELECT addendum_no, article_no, article_content
       FROM "${tbl.addendum}" WHERE "${col}" = ? ORDER BY id`,
      [key],
    );
    const map = new Map<string, AdminRulesAddendumGroupOut>();
    for (const r of addRaw) {
      const addendum_no = str(pick(r, "addendum_no", "ADDENDUM_NO"));
      const addendumKey = addendum_no || "(부칙)";
      if (!map.has(addendumKey)) {
        map.set(addendumKey, { key: addendumKey, header: addendum_no || "", rows: [] });
      }
      map.get(addendumKey)!.rows.push({
        article_no: str(pick(r, "article_no", "ARTICLE_NO")),
        article_content: str(pick(r, "article_content", "ARTICLE_CONTENT")),
      });
    }
    addendumGroups.push(...map.values());
  }

  const annexes: AdminRulesAnnexOut[] = [];

  if (tablePresence.annex) {
    const annexCols = await tableColumnNamesLower(db, tbl.annex);
    const attCols = tablePresence.attachment
      ? await tableColumnNamesLower(db, tbl.attachment)
      : new Set<string>();
    const canJoinByByl =
      tablePresence.attachment &&
      ["gubun", "param", "seq_id", "byl_seq"].every((c) => annexCols.has(c)) &&
      ["gubun", "param", "seq_id", "byl_seq", "id"].every((c) => attCols.has(c));

    const attachSlug = adminRulesAttachSlug(source);

    const isLocallyAvailable = (
      downloaded: number,
      localPath: string,
    ): boolean => {
      if (!downloaded) return false;
      const lp = localPath.trim();
      if (!lp) return false;
      try {
        const abs = resolveAdminAttachmentPath(attachSlug, lp);
        return fs.existsSync(abs);
      } catch {
        return false;
      }
    };

    if (canJoinByByl) {
      const hasRole = attCols.has("attachment_role");
      const hasDownloaded = attCols.has("downloaded");
      const hasUrl = attCols.has("download_url");
      const joinSql = `
        SELECT
          a.id AS annex_id,
          a.byl_seq AS annex_byl_seq,
          a.annex_title AS annex_title,
          a.annex_content AS annex_content,
          t.id AS att_id,
          t.fl_seq AS att_fl_seq,
          t.file_name AS att_file_name,
          t.file_type AS att_file_type,
          ${hasRole ? "t.attachment_role" : "''"} AS att_role,
          ${hasDownloaded ? "t.downloaded" : "0"} AS att_downloaded,
          t.local_path AS att_local_path,
          ${hasUrl ? "t.download_url" : "''"} AS att_download_url
        FROM "${tbl.annex}" a
        LEFT JOIN "${tbl.attachment}" t
          ON CAST(a.gubun AS TEXT) = CAST(t.gubun AS TEXT)
         AND CAST(a.param AS TEXT) = CAST(t.param AS TEXT)
         AND CAST(COALESCE(a.seq_id, '') AS TEXT) = CAST(COALESCE(t.seq_id, '') AS TEXT)
         AND CAST(COALESCE(a.byl_seq, '') AS TEXT) = CAST(COALESCE(t.byl_seq, '') AS TEXT)
        WHERE a."${col}" = ?
        ORDER BY a.id ASC, t.id ASC
      `;
      const joined = await stmtAll<Record<string, unknown>>(db, joinSql, [key]);
      const byAnnex = new Map<number, AdminRulesAnnexOut>();
      const order: number[] = [];

      for (const row of joined) {
        const annexId = num(pick(row, "annex_id", "ANNEX_ID"));
        if (!byAnnex.has(annexId)) {
          byAnnex.set(annexId, {
            id: annexId,
            bylSeq: str(pick(row, "annex_byl_seq", "ANNEX_BYL_SEQ")),
            title: decodeAdminRulesHtmlEntities(
              str(pick(row, "annex_title", "ANNEX_TITLE")),
            ),
            annexContent: str(pick(row, "annex_content", "ANNEX_CONTENT")),
            files: [],
          });
          order.push(annexId);
        }
        const attId = num(pick(row, "att_id", "ATT_ID"));
        if (!attId) continue;
        const fileName = str(pick(row, "att_file_name", "ATT_FILE_NAME"));
        const fileType = str(pick(row, "att_file_type", "ATT_FILE_TYPE"));
        const role = str(pick(row, "att_role", "ATT_ROLE"));
        const downloaded = num(pick(row, "att_downloaded", "ATT_DOWNLOADED"));
        const localPath = str(pick(row, "att_local_path", "ATT_LOCAL_PATH"));
        const downloadUrl = str(pick(row, "att_download_url", "ATT_DOWNLOAD_URL"));
        const availableLocally = isLocallyAvailable(downloaded, localPath);
        const kind = kindFromAttachmentRole(role, fileName, fileType);
        byAnnex.get(annexId)!.files.push({
          attachmentId: attId,
          flSeq: str(pick(row, "att_fl_seq", "ATT_FL_SEQ")),
          fileName,
          fileType,
          kind,
          role: role || roleFromKind(kind),
          availableLocally,
          downloadUrl: availableLocally ? "" : downloadUrl,
        });
      }

      for (const id of order) {
        annexes.push(byAnnex.get(id)!);
      }
    } else {
      // 구버전 스키마: han_fl_seq / pdf_fl_seq / image_fl_seqs ↔ fl_seq
      const attMap = new Map<
        string,
        {
          id: number;
          file_name: string;
          file_type: string;
          local_path: string;
          download_url: string;
          downloaded: number;
          role: string;
        }
      >();
      if (tablePresence.attachment) {
        const hasRole = attCols.has("attachment_role");
        const hasDownloaded = attCols.has("downloaded");
        const hasUrl = attCols.has("download_url");
        const hasId = attCols.has("id");
        const attRaw = await stmtAll<Record<string, unknown>>(
          db,
          `SELECT ${hasId ? "id," : ""} fl_seq, file_name, file_type, local_path,
                  ${hasUrl ? "download_url," : ""} ${hasDownloaded ? "downloaded," : ""}
                  ${hasRole ? "attachment_role" : "'' AS attachment_role"}
           FROM "${tbl.attachment}" WHERE "${col}" = ?`,
          [key],
        );
        for (const a of attRaw) {
          attMap.set(str(pick(a, "fl_seq", "FL_SEQ")), {
            id: num(pick(a, "id", "ID")),
            file_name: str(pick(a, "file_name", "FILE_NAME")),
            file_type: str(pick(a, "file_type", "FILE_TYPE")),
            local_path: str(pick(a, "local_path", "LOCAL_PATH")),
            download_url: str(pick(a, "download_url", "DOWNLOAD_URL")),
            downloaded: hasDownloaded
              ? num(pick(a, "downloaded", "DOWNLOADED"))
              : 1,
            role: str(pick(a, "attachment_role", "ATTACHMENT_ROLE")),
          });
        }
      }

      const axRaw = await stmtAll<Record<string, unknown>>(
        db,
        `SELECT id, byl_seq, annex_title, annex_content, han_fl_seq, pdf_fl_seq, image_fl_seqs
         FROM "${tbl.annex}" WHERE "${col}" = ? ORDER BY id`,
        [key],
      );

      for (const ax of axRaw) {
        const files: AdminRulesAnnexFileOut[] = [];
        const pushSeq = (seq: string | null | undefined) => {
          if (!seq?.trim()) return;
          const att = attMap.get(String(seq));
          if (!att) return;
          const availableLocally = isLocallyAvailable(
            att.downloaded,
            att.local_path,
          );
          const kind = kindFromAttachmentRole(
            att.role,
            att.file_name,
            att.file_type,
          );
          files.push({
            attachmentId: att.id,
            flSeq: String(seq),
            fileName: att.file_name,
            fileType: att.file_type,
            kind,
            role: att.role || roleFromKind(kind),
            availableLocally,
            downloadUrl: availableLocally ? "" : att.download_url,
          });
        };
        pushSeq(str(pick(ax, "han_fl_seq", "HAN_FL_SEQ")));
        pushSeq(str(pick(ax, "pdf_fl_seq", "PDF_FL_SEQ")));
        for (const seq of parseImageSeqs(
          str(pick(ax, "image_fl_seqs", "IMAGE_FL_SEQS")),
        )) {
          pushSeq(seq);
        }

        annexes.push({
          id: num(pick(ax, "id", "ID")),
          bylSeq: str(pick(ax, "byl_seq", "BYL_SEQ")),
          title: decodeAdminRulesHtmlEntities(
            str(pick(ax, "annex_title", "ANNEX_TITLE")),
          ),
          annexContent: str(pick(ax, "annex_content", "ANNEX_CONTENT")),
          files,
        });
      }
    }
  }

  const lawName = firstFull?.law_name || source.description;
  const articleImages = await listArticleImagesForSource(
    db,
    source,
    lawName,
    options?.articleImageApiBase,
  );

  return {
    tableName: source.table_name,
    lawName,
    promulgationNo: firstFull?.promulgation_no || "",
    promulgationDate: firstFull?.promulgation_dt || "",
    seqId: firstFull?.seq_id || "",
    lawUrl: source.url,
    chapters,
    looseArticles,
    addendumGroups,
    annexes,
    articleImages,
    tablePresence,
  };
}
