import "server-only";

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  formatClipCustomsChiefHsSgn,
  normalizeClipCustomsChiefHsQuery,
} from "@/app/lib/clip-customs-chief-shared";
import {
  CLIP_HS_IMPORT_GUIDE_SORT_KEYS,
  type ClipHsImportGuideDetail,
  type ClipHsImportGuideListRow,
  type ClipHsImportGuidePdfInfo,
  type ClipHsImportGuideQueryParams,
  type ClipHsImportGuideSortKey,
} from "@/app/lib/clip-hs-import-guide-shared";
import { getSmartLawSqliteDbPath } from "@/app/lib/smart-law-sqlite-paths";

export {
  CLIP_HS_IMPORT_GUIDE_SORT_KEYS,
  type ClipHsImportGuideDetail,
  type ClipHsImportGuideListRow,
  type ClipHsImportGuidePdfInfo,
  type ClipHsImportGuideQueryParams,
  type ClipHsImportGuideSortKey,
} from "@/app/lib/clip-hs-import-guide-shared";

const GUIDE_TABLE = "hs_import_declaration_guide";
const FILE_TABLE = "hs_import_declaration_guide_files";

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

export function formatClipHsImportGuideRegisteredAt(
  raw: string | null | undefined,
): string {
  const t = str(raw);
  if (!t) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const digits = t.replace(/\D/g, "");
  if (digits.length >= 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  }
  return t;
}

export function openClipHsImportGuideDb(): DatabaseSync {
  const p = getSmartLawSqliteDbPath();
  if (!fs.existsSync(p)) {
    throw new Error(`DB 파일이 없습니다: ${p}`);
  }
  const db = new DatabaseSync(p, { readOnly: true });
  if (!hasTable(db, GUIDE_TABLE)) {
    db.close();
    throw new Error(
      `${GUIDE_TABLE} 테이블이 없습니다. hs_import_guide_crawler.py 로 수집하세요.`,
    );
  }
  return db;
}

function normalizeSort(sort: string | null | undefined): ClipHsImportGuideSortKey {
  const s = (sort ?? "hs_code").trim();
  return (CLIP_HS_IMPORT_GUIDE_SORT_KEYS as readonly string[]).includes(s)
    ? (s as ClipHsImportGuideSortKey)
    : "hs_code";
}

function normalizeDir(d: string | null | undefined): "ASC" | "DESC" {
  return d?.trim().toLowerCase() === "desc" ? "DESC" : "ASC";
}

const SORT_SQL: Record<ClipHsImportGuideSortKey, string> = {
  hs_code: "hs_code",
  product_name: "product_name",
  source_updated_at: "source_updated_at",
};

function mapListRow(row: Record<string, unknown>): ClipHsImportGuideListRow {
  const hsCode = str(row.hs_code);
  return {
    hs_code: hsCode,
    hs_code_display: formatClipCustomsChiefHsSgn(hsCode, ""),
    product_name: str(row.product_name),
    registered_at: formatClipHsImportGuideRegisteredAt(
      str(row.source_updated_at),
    ),
  };
}

function mapDetailRow(row: Record<string, unknown>): ClipHsImportGuideDetail {
  const hsCode = str(row.hs_code);
  return {
    hs_code: hsCode,
    hs_code_display: formatClipCustomsChiefHsSgn(hsCode, ""),
    product_name: str(row.product_name),
    registered_at: formatClipHsImportGuideRegisteredAt(
      str(row.source_updated_at),
    ),
    name_guidance: str(row.name_guidance),
    name_example: str(row.name_example),
    name_error_example: str(row.name_error_example),
    transaction_name_guidance: str(row.transaction_name_guidance),
    transaction_name_example: str(row.transaction_name_example),
    transaction_name_error_example: str(row.transaction_name_error_example),
    model_spec_guidance: str(row.model_spec_guidance),
    model_spec_example: str(row.model_spec_example),
    model_spec_error_example: str(row.model_spec_error_example),
    ingredient_guidance: str(row.ingredient_guidance),
    ingredient_example: str(row.ingredient_example),
    ingredient_error_example: str(row.ingredient_error_example),
    import_requirement_guidance: str(row.import_requirement_guidance),
    import_requirement_example: str(row.import_requirement_example),
    import_requirement_error_example: str(row.import_requirement_error_example),
    declaration_caution: str(row.declaration_caution),
    special_material: str(row.special_material),
    remarks: str(row.remarks),
    detail_url: str(row.detail_url),
  };
}

export function countClipHsImportGuides(db: DatabaseSync): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM ${GUIDE_TABLE}`)
    .get() as { n: number };
  return num(row?.n);
}

export function queryClipHsImportGuides(
  db: DatabaseSync,
  params: ClipHsImportGuideQueryParams,
): { rows: ClipHsImportGuideListRow[]; total: number } {
  const page = Math.max(1, Math.floor(params.page) || 1);
  const pageSize = Math.min(100, Math.max(5, Math.floor(params.pageSize) || 10));
  const hsDigits = normalizeClipCustomsChiefHsQuery(params.hsCode);
  const productName = str(params.productName);
  const sort = normalizeSort(params.sort);
  const dir = normalizeDir(params.sort_dir);

  const where: string[] = [];
  const bind: unknown[] = [];

  if (hsDigits) {
    where.push("hs_code LIKE ?");
    bind.push(`${hsDigits}%`);
  }
  if (productName) {
    where.push("product_name LIKE ?");
    bind.push(`%${productName}%`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS n FROM ${GUIDE_TABLE} ${whereSql}`)
    .get(...bind) as { n: number };
  const total = num(totalRow?.n);

  const orderCol = SORT_SQL[sort];
  const rows = db
    .prepare(
      `SELECT hs_code, product_name, source_updated_at
       FROM ${GUIDE_TABLE}
       ${whereSql}
       ORDER BY ${orderCol} ${dir}, hs_code ASC
       LIMIT ? OFFSET ?`,
    )
    .all(...bind, pageSize, (page - 1) * pageSize)
    .map((row) => mapListRow(row as Record<string, unknown>));

  return { rows, total };
}

export function getClipHsImportGuideDetail(
  db: DatabaseSync,
  hsCode: string,
): ClipHsImportGuideDetail | null {
  const key = normalizeClipCustomsChiefHsQuery(hsCode);
  if (!key) return null;
  const row = db
    .prepare(`SELECT * FROM ${GUIDE_TABLE} WHERE hs_code = ?`)
    .get(key) as Record<string, unknown> | undefined;
  if (!row) return null;
  return mapDetailRow(row);
}

function resolveExistingPdfPath(savedPath: string): string | null {
  const trimmed = savedPath.trim();
  if (!trimmed) return null;
  if (fs.existsSync(trimmed)) return trimmed;

  const fileName = path.basename(trimmed);
  const candidates = [
    path.join("C:/SQLiteDB/downloads/HS별품명_규격_수입신고_가이드", fileName),
    path.join(
      "C:/Manus/관세법령정보포털_통관정보/8.HS별 품명규격 신고가이드/2026-09-11 V1/downloads/HS별품명_규격_수입신고_가이드",
      fileName,
    ),
    path.join(
      "D:/Manus/관세법령정보포털_통관정보/8.HS별 품명규격 신고가이드/2026-09-11 V1/downloads/HS별품명_규격_수입신고_가이드",
      fileName,
    ),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export function getClipHsImportGuidePdfInfo(
  db: DatabaseSync,
): ClipHsImportGuidePdfInfo {
  if (!hasTable(db, FILE_TABLE)) {
    return {
      available: false,
      file_name: "",
      byte_size: 0,
      download_status: "",
    };
  }
  const row = db
    .prepare(
      `SELECT saved_path, original_filename, byte_size, download_status
       FROM ${FILE_TABLE}
       WHERE download_status LIKE 'DOWNLOADED%'
       ORDER BY file_id DESC
       LIMIT 1`,
    )
    .get() as Record<string, unknown> | undefined;
  if (!row) {
    return {
      available: false,
      file_name: "",
      byte_size: 0,
      download_status: "",
    };
  }
  const savedPath = str(row.saved_path);
  const resolved = resolveExistingPdfPath(savedPath);
  return {
    available: Boolean(resolved),
    file_name:
      str(row.original_filename) ||
      (resolved ? path.basename(resolved) : "HS별품명_규격_수입신고_가이드.pdf"),
    byte_size: num(row.byte_size),
    download_status: str(row.download_status),
  };
}

export function getClipHsImportGuidePdfPath(
  db: DatabaseSync,
): { absolutePath: string; fileName: string } | null {
  if (!hasTable(db, FILE_TABLE)) return null;
  const row = db
    .prepare(
      `SELECT saved_path, original_filename
       FROM ${FILE_TABLE}
       WHERE download_status LIKE 'DOWNLOADED%'
       ORDER BY file_id DESC
       LIMIT 1`,
    )
    .get() as Record<string, unknown> | undefined;
  if (!row) return null;
  const savedPath = str(row.saved_path);
  const resolved = resolveExistingPdfPath(savedPath);
  if (!resolved) return null;
  return {
    absolutePath: resolved,
    fileName:
      str(row.original_filename) ||
      path.basename(resolved) ||
      "HS별품명_규격_수입신고_가이드.pdf",
  };
}
