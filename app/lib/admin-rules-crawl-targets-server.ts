/**
 * 행정규칙 크롤링 대상 Excel (01_크롤링대상) — SQLite 조회 목록 병합용
 */
import fs from "node:fs";
import path from "node:path";
import type { AdminRulesConfigSource } from "@/app/lib/admin-rules-paths";
import { adminRulesSourceFamily } from "@/app/lib/admin-rules-server";
import { preferCDrive } from "@/app/lib/drive-fallback";

const DEFAULT_XLSX = preferCDrive(
  "C:/Manus/행정규칙_안만복/2026-08-31 COB_CRB법령정보/법령_행정규칙_크롤링대상_종합_20260902.xlsx",
);
const SHEET = "01_크롤링대상";
/** 0-based first data row (헤더는 3행) */
const DATA_ROW = 3;

export type AdminRulesCrawlTarget = {
  targetFlag: string;
  priority: string;
  collectAction: string;
  lawName: string;
  documentType: string;
  lawTypeCode: string;
  portalLawType: string;
  portalLawId: string;
  topLawId: string;
  topLawName: string;
};

export type AdminRulesCrawlTargetMeta = {
  excelPath: string | null;
  sheet: string;
  totalRows: number;
  allowedRows: number;
  excludedLawStatuteRows: number;
  loadedAt: string;
  /** `onlyStatutes` | `excludeStatutes` */
  filterMode?: "onlyStatutes" | "excludeStatutes";
};

function dedupeCrawlTargets(
  parsed: AdminRulesCrawlTarget[],
): AdminRulesCrawlTarget[] {
  const byName = new Map<string, AdminRulesCrawlTarget>();
  for (const target of parsed) {
    const key = normalizeRuleName(target.lawName);
    const prev = byName.get(key);
    if (!prev) {
      byName.set(key, target);
      continue;
    }
    const rank = (t: AdminRulesCrawlTarget) =>
      (t.targetFlag === "Y" ? 4 : t.targetFlag === "검토" ? 2 : 0) +
      (t.portalLawId ? 1 : 0);
    if (rank(target) > rank(prev)) byName.set(key, target);
  }
  return Array.from(byName.values());
}

function parseCrawlTargetRows(
  rows: unknown[][],
  filterMode: "onlyStatutes" | "excludeStatutes",
): { targets: AdminRulesCrawlTarget[]; statuteRows: number; nonStatuteRows: number } {
  const parsed: AdminRulesCrawlTarget[] = [];
  let statuteRows = 0;
  let nonStatuteRows = 0;

  for (let i = DATA_ROW; i < rows.length; i += 1) {
    const row = rows[i];
    if (!Array.isArray(row) || !row.some((cell) => normalizeCell(cell))) {
      continue;
    }
    const mapped = mapWorkbookRow(row);
    if (!mapped) continue;
    const isStatute = isLawStatuteDocumentType(mapped.documentType);
    if (isStatute) statuteRows += 1;
    else nonStatuteRows += 1;

    if (filterMode === "onlyStatutes" && !isStatute) continue;
    if (filterMode === "excludeStatutes" && isStatute) continue;
    parsed.push(mapped);
  }

  return { targets: dedupeCrawlTargets(parsed), statuteRows, nonStatuteRows };
}

function readCrawlTargetSheetRows(filePath: string): unknown[][] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require("xlsx") as typeof import("xlsx");
  const buffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheet = workbook.Sheets[SHEET];
  if (!sheet) {
    throw new Error(`Excel 시트 "${SHEET}"를 찾을 수 없습니다: ${filePath}`);
  }
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });
}

export type AdminRulesSourceWithCrawl = AdminRulesConfigSource & {
  source_family?: "admin" | "law";
  unified_main_table?: string;
  table_in_db?: boolean;
  table_presence?: {
    addendum: boolean;
    annex: boolean;
    attachment: boolean;
  } | null;
  catalog_param?: string | null;
  catalog_description?: string | null;
  catalog_law_url?: string | null;
  crawl_target_only?: boolean;
  crawl_document_type?: string | null;
  crawl_target_flag?: string | null;
  crawl_portal_law_id?: string | null;
  /** 본문 없음 · 다른 규칙 param의 별표·서식 위임 */
  satellite_annex_host_param?: string | null;
  satellite_annex_host_description?: string | null;
  satellite_matched_annex_count?: number | null;
};

function normalizeCell(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function normalizeRuleName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function isExcludedLawStatuteDocumentType(documentType: string): boolean {
  const t = documentType.trim();
  return t === "법령" || t === "법률";
}

/** E열 문서구분이 법령(법률)인 행 — OPEN API 법령 조회용 */
export function isLawStatuteDocumentType(documentType: string): boolean {
  return isExcludedLawStatuteDocumentType(documentType);
}

export function normalizeCrawlTargetRuleName(name: string): string {
  return normalizeRuleName(name);
}

function excelCandidates(): string[] {
  const envPath = process.env.ADMIN_RULES_CRAWL_TARGETS_XLSX?.trim();
  const candidates = [envPath, DEFAULT_XLSX].filter(
    (p): p is string => Boolean(p),
  );
  return [...new Set(candidates.map((p) => path.resolve(p)))];
}

export function resolveAdminRulesCrawlTargetsExcelPath(): string | null {
  for (const candidate of excelCandidates()) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function crawlTargetPortalParam(portalLawId: string, lawName: string): string {
  const id = portalLawId.replace(/\D/g, "").padStart(6, "0").slice(-6);
  if (id && id !== "000000") return `crawl-${id}`;
  const slug = lawName
    .trim()
    .slice(0, 40)
    .replace(/[^\w가-힣]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return `crawl-${slug || "unknown"}`;
}

function crawlTargetUrl(lawName: string, documentType: string): string {
  const doc = documentType.trim();
  const segment =
    doc === "시행령" ||
    doc === "시행규칙" ||
    doc === "법률" ||
    doc === "법령" ||
    doc === "대통령령"
      ? "법령"
      : "행정규칙";
  return `https://www.law.go.kr/${segment}/${encodeURIComponent(lawName.trim())}`;
}

function mapWorkbookRow(row: unknown[]): AdminRulesCrawlTarget | null {
  const lawName = normalizeRuleName(normalizeCell(row[3]));
  if (!lawName) return null;
  return {
    targetFlag: normalizeCell(row[0]),
    priority: normalizeCell(row[1]),
    collectAction: normalizeCell(row[2]),
    lawName,
    documentType: normalizeCell(row[4]),
    lawTypeCode: normalizeCell(row[5]),
    portalLawType: normalizeCell(row[6]),
    portalLawId: normalizeCell(row[7]),
    topLawId: normalizeCell(row[10]),
    topLawName: normalizeCell(row[11]),
  };
}

export function loadAdminRulesCrawlTargetsFromExcel(
  filePath: string,
): { targets: AdminRulesCrawlTarget[]; meta: AdminRulesCrawlTargetMeta } {
  const rows = readCrawlTargetSheetRows(filePath);
  const { targets, statuteRows, nonStatuteRows } = parseCrawlTargetRows(
    rows,
    "excludeStatutes",
  );

  return {
    targets,
    meta: {
      excelPath: filePath,
      sheet: SHEET,
      totalRows: statuteRows + nonStatuteRows,
      allowedRows: targets.length,
      excludedLawStatuteRows: statuteRows,
      loadedAt: new Date().toISOString(),
      filterMode: "excludeStatutes",
    },
  };
}

/** E열 `법령`/`법률`만 — OPEN API 법령 조회 목록용 */
export function loadLawStatuteCrawlTargetsFromExcel(
  filePath: string,
): { targets: AdminRulesCrawlTarget[]; meta: AdminRulesCrawlTargetMeta } {
  const rows = readCrawlTargetSheetRows(filePath);
  const { targets, statuteRows, nonStatuteRows } = parseCrawlTargetRows(
    rows,
    "onlyStatutes",
  );

  return {
    targets,
    meta: {
      excelPath: filePath,
      sheet: SHEET,
      totalRows: statuteRows + nonStatuteRows,
      allowedRows: targets.length,
      excludedLawStatuteRows: nonStatuteRows,
      loadedAt: new Date().toISOString(),
      filterMode: "onlyStatutes",
    },
  };
}

export function getLawStatuteCrawlTargets(): {
  targets: AdminRulesCrawlTarget[];
  meta: AdminRulesCrawlTargetMeta;
} | null {
  const excelPath = resolveAdminRulesCrawlTargetsExcelPath();
  if (!excelPath) return null;
  return loadLawStatuteCrawlTargetsFromExcel(excelPath);
}

type CrawlTargetBundle = {
  targets: AdminRulesCrawlTarget[];
  meta: AdminRulesCrawlTargetMeta;
};

let adminRulesCrawlTargetCache: {
  excelPath: string;
  mtimeMs: number;
  bundle: CrawlTargetBundle;
} | null = null;

export function getAdminRulesCrawlTargets(): CrawlTargetBundle | null {
  const excelPath = resolveAdminRulesCrawlTargetsExcelPath();
  if (!excelPath) return null;
  try {
    const mtimeMs = fs.statSync(excelPath).mtimeMs;
    if (
      adminRulesCrawlTargetCache &&
      adminRulesCrawlTargetCache.excelPath === excelPath &&
      adminRulesCrawlTargetCache.mtimeMs === mtimeMs
    ) {
      return adminRulesCrawlTargetCache.bundle;
    }
    const bundle = loadAdminRulesCrawlTargetsFromExcel(excelPath);
    adminRulesCrawlTargetCache = { excelPath, mtimeMs, bundle };
    return bundle;
  } catch {
    return loadAdminRulesCrawlTargetsFromExcel(excelPath);
  }
}

function crawlTargetToSource(target: AdminRulesCrawlTarget): AdminRulesSourceWithCrawl {
  const url = crawlTargetUrl(target.lawName, target.documentType);
  const param = crawlTargetPortalParam(target.portalLawId, target.lawName);
  const base: AdminRulesConfigSource = {
    param,
    gubun: target.documentType || "adm_rule",
    table_name: param,
    description: target.lawName,
    url,
    note: target.collectAction || undefined,
    category: target.portalLawType || target.lawTypeCode || undefined,
  };
  const family = adminRulesSourceFamily(base);
  return {
    ...base,
    source_family: family,
    unified_main_table: family === "law" ? "raw_rule" : "admin_rule",
    table_in_db: false,
    table_presence: { addendum: false, annex: false, attachment: false },
    catalog_param: null,
    catalog_description: null,
    catalog_law_url: null,
    crawl_target_only: true,
    crawl_document_type: target.documentType || null,
    crawl_target_flag: target.targetFlag || null,
    crawl_portal_law_id: target.portalLawId || null,
  };
}

/**
 * Excel 크롤링 대상(법령/법률 제외·이름 dedupe)을 목록의 기준으로 DB 소스와 병합.
 * - 행 수 = `crawlBundle.targets.length` (예: 615)
 * - 이름이 DB `rule_master`와 같으면 DB 메타·`table_in_db` 사용
 * - Excel에만 있으면 `crawl_target_only` 플레이스홀더
 * - Excel 615에 없는 `rule_master` 단독 항목은 목록에 넣지 않음
 */
export function mergeAdminRulesSourcesWithCrawlTargets(
  dbSources: AdminRulesSourceWithCrawl[],
  crawlBundle: { targets: AdminRulesCrawlTarget[]; meta: AdminRulesCrawlTargetMeta },
): AdminRulesSourceWithCrawl[] {
  const dbByName = new Map<string, AdminRulesSourceWithCrawl>();
  for (const source of dbSources) {
    const name = normalizeRuleName(source.description ?? "");
    if (!name) continue;
    const prev = dbByName.get(name);
    if (!prev || (source.table_in_db && !prev.table_in_db)) {
      dbByName.set(name, source);
    }
  }

  const merged: AdminRulesSourceWithCrawl[] = [];
  for (const target of crawlBundle.targets) {
    const name = normalizeRuleName(target.lawName);
    const fromDb = dbByName.get(name);
    merged.push(fromDb ?? crawlTargetToSource(target));
  }

  return merged.sort((a, b) =>
    (a.description ?? "").localeCompare(b.description ?? "", "ko"),
  );
}

export function findCrawlTargetByParam(
  targets: AdminRulesCrawlTarget[],
  param: string,
): AdminRulesCrawlTarget | undefined {
  const want = param.trim();
  return targets.find(
    (t) => crawlTargetPortalParam(t.portalLawId, t.lawName) === want,
  );
}

export function crawlTargetToConfigSource(
  target: AdminRulesCrawlTarget,
): AdminRulesConfigSource {
  const param = crawlTargetPortalParam(target.portalLawId, target.lawName);
  return {
    param,
    gubun: target.documentType || "adm_rule",
    table_name: param,
    description: target.lawName,
    url: crawlTargetUrl(target.lawName, target.documentType),
    note: target.collectAction || undefined,
    category: target.portalLawType || target.lawTypeCode || undefined,
  };
}
