import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  PROCESSING_STATUS_FIELD_DEFS,
  isProcessingStatusRowExcluded,
  type ProcessingStatusItem,
  type ProcessingStatusPayload,
} from "@/app/lib/data-processing-status-shared";
import { getSmartLawAttachRoot } from "@/app/lib/smart-law-db";

const XLSX_NAME = "법령정보및관세율,품목분류사례 처리현황.xlsx";
const DEV_XLSX = `D:/Manus/${XLSX_NAME}`;
const PROJECT_ROOT = process.cwd();
const JSON_PATH = path.join(PROJECT_ROOT, "app/lib/data-processing-status.json");
const PROJECT_COPY = path.join(
  PROJECT_ROOT,
  "docs/dashboard/data-processing-status.xlsx",
);
const EXTRACT_SCRIPT = path.join(
  PROJECT_ROOT,
  "scripts/extract_data_processing_status.py",
);

function normalizeCell(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function emptyRow(row: unknown[]): boolean {
  return !row.some((cell) => normalizeCell(cell).length > 0);
}

function excelCandidates(): string[] {
  const envPath = process.env.DATA_PROCESSING_STATUS_XLSX?.trim();
  const rpaXlsx = path.join(getSmartLawAttachRoot(), "excel", XLSX_NAME);
  const candidates = [envPath, rpaXlsx, DEV_XLSX, PROJECT_COPY].filter(
    (p): p is string => Boolean(p),
  );
  return [...new Set(candidates.map((p) => path.resolve(p)))];
}

export function resolveProcessingStatusExcelPath(): string | null {
  for (const candidate of excelCandidates()) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function readJsonPayload(): ProcessingStatusPayload | null {
  if (!fs.existsSync(JSON_PATH)) return null;
  try {
    const raw = fs.readFileSync(JSON_PATH, "utf8");
    return JSON.parse(raw) as ProcessingStatusPayload;
  } catch {
    return null;
  }
}

function writeJsonPayload(payload: ProcessingStatusPayload): void {
  const tmpPath = `${JSON_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.renameSync(tmpPath, JSON_PATH);
}

function copyExcelToProject(excelPath: string): void {
  const resolvedExcel = path.resolve(excelPath);
  const resolvedCopy = path.resolve(PROJECT_COPY);
  if (resolvedExcel === resolvedCopy) return;
  fs.mkdirSync(path.dirname(PROJECT_COPY), { recursive: true });
  fs.copyFileSync(excelPath, PROJECT_COPY);
}

export function getExcelModifiedAt(excelPath: string): number | null {
  try {
    if (!fs.existsSync(excelPath)) return null;
    return fs.statSync(excelPath).mtimeMs;
  } catch {
    return null;
  }
}

function storedExcelModifiedMs(payload: ProcessingStatusPayload | null): number {
  if (!payload?.excelModifiedAt) return 0;
  const parsed = Date.parse(payload.excelModifiedAt);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function enrichPayload(
  payload: ProcessingStatusPayload,
  excelPath: string,
  excelMtime: number,
): ProcessingStatusPayload {
  return {
    ...payload,
    source: excelPath,
    syncedAt: new Date().toISOString(),
    excelModifiedAt: new Date(excelMtime).toISOString(),
  };
}

export function parseProcessingStatusWorkbook(
  filePath: string,
): ProcessingStatusPayload {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require("xlsx") as typeof import("xlsx");
  const buffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheet = workbook.Sheets["리스트"];
  if (!sheet) {
    throw new Error(`Excel 시트 "리스트"를 찾을 수 없습니다: ${filePath}`);
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });

  const items: ProcessingStatusItem[] = [];
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!Array.isArray(row) || emptyRow(row)) continue;

    const item = {} as ProcessingStatusItem;
    for (let col = 0; col < PROCESSING_STATUS_FIELD_DEFS.length; col += 1) {
      const key = PROCESSING_STATUS_FIELD_DEFS[col].key;
      item[key] = normalizeCell(row[col]);
    }

    if (!item.category && !item.progress && !item.name) continue;
    if (isProcessingStatusRowExcluded(item)) continue;
    items.push(item);
  }

  return {
    source: filePath,
    sheet: "리스트",
    columns: PROCESSING_STATUS_FIELD_DEFS.map(({ key, label }) => ({
      key,
      label,
    })),
    items,
  };
}

function syncViaPython(excelPath: string): ProcessingStatusPayload {
  if (!fs.existsSync(EXTRACT_SCRIPT)) {
    throw new Error(`추출 스크립트를 찾을 수 없습니다: ${EXTRACT_SCRIPT}`);
  }

  const result = spawnSync("python", [EXTRACT_SCRIPT], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      DATA_PROCESSING_STATUS_XLSX: excelPath,
    },
    encoding: "utf8",
    shell: true,
    timeout: 120_000,
  });

  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(
      detail || `Python 추출 실패 (exit ${result.status ?? "unknown"})`,
    );
  }

  const cached = readJsonPayload();
  if (!cached) {
    throw new Error("Python 추출 후 JSON을 읽을 수 없습니다.");
  }

  const excelMtime = getExcelModifiedAt(excelPath);
  if (excelMtime == null) return cached;
  return enrichPayload(cached, excelPath, excelMtime);
}

function parseExcelPayload(excelPath: string): ProcessingStatusPayload {
  try {
    return parseProcessingStatusWorkbook(excelPath);
  } catch (nodeError) {
    console.warn(
      "[processing-status] Node Excel parse failed, falling back to Python:",
      nodeError,
    );
    return syncViaPython(excelPath);
  }
}

export function syncProcessingStatusFromExcel(options?: {
  force?: boolean;
}): ProcessingStatusPayload {
  const excelPath = resolveProcessingStatusExcelPath();
  const cached = readJsonPayload();

  if (!excelPath) {
    if (cached) return cached;
    throw new Error("처리현황 Excel 파일을 찾을 수 없습니다.");
  }

  const excelMtime = getExcelModifiedAt(excelPath);
  if (excelMtime == null) {
    if (cached) return cached;
    throw new Error(`처리현황 Excel 상태를 확인할 수 없습니다: ${excelPath}`);
  }

  const storedExcelMtime = storedExcelModifiedMs(cached);
  const needsSync =
    options?.force === true || excelMtime > storedExcelMtime + 0.5;

  if (!needsSync && cached) {
    return {
      ...cached,
      source: excelPath,
      syncedAt: cached.syncedAt ?? new Date().toISOString(),
      excelModifiedAt: new Date(excelMtime).toISOString(),
    };
  }

  copyExcelToProject(excelPath);
  const payload = enrichPayload(
    parseExcelPayload(excelPath),
    excelPath,
    excelMtime,
  );
  writeJsonPayload(payload);
  return payload;
}

export function loadProcessingStatusPayload(options?: {
  force?: boolean;
}): ProcessingStatusPayload {
  if (options?.force) {
    return syncProcessingStatusFromExcel({ force: true });
  }
  return loadCachedProcessingStatusPayload();
}

/** 저장된 JSON만 반환 — Excel 파일은 읽지 않음 */
export function loadCachedProcessingStatusPayload(): ProcessingStatusPayload {
  const cached = readJsonPayload();
  if (cached) return cached;

  const excelPath = resolveProcessingStatusExcelPath();
  if (excelPath) {
    throw new Error(
      "처리현황 캐시가 없습니다. [Refresh]로 Excel을 불러오세요.",
    );
  }

  throw new Error("처리현황 Excel 파일을 찾을 수 없습니다.");
}
