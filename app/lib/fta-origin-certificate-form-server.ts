import "server-only";

import type { FtaOriginCertificateFormRow } from "@/app/lib/fta-origin-certificate-form-shared";
import {
  FTA_ORIGIN_CERT_FORM_DIR_DEFAULT,
  FTA_ORIGIN_CERT_FORM_SOURCE_URL,
} from "@/app/lib/fta-origin-certificate-form-shared";
import { getSmartLawSqliteDbPath } from "@/app/lib/smart-law-sqlite-paths";
import {
  guessYestradeContentType,
  resolveYestradeLocalFile,
  yestradeNum,
  yestradeStr,
} from "@/app/lib/yestrade-sqlite";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export const FTA_ORIGIN_CERT_FORM_TABLE = "fta_origin_certificate_form";
export {
  FTA_ORIGIN_CERT_FORM_DIR_DEFAULT,
  FTA_ORIGIN_CERT_FORM_SOURCE_URL,
};

const FILE_API = "/api/fta-origin-certificate-forms/file";

const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS ${FTA_ORIGIN_CERT_FORM_TABLE} (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agreement_code TEXT NOT NULL UNIQUE,
  agreement_name TEXT NOT NULL,
  title TEXT NOT NULL,
  file_name TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  source_url TEXT,
  synced_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fta_ocf_sort
  ON ${FTA_ORIGIN_CERT_FORM_TABLE}(sort_order, agreement_name);
`;

/** 원본 FTA 포털 협정 버튼 순서에 가깝게 */
const AGREEMENT_SORT: string[] = [
  "한칠레",
  "한싱가포르",
  "한EFTA",
  "한ASEAN",
  "한인도",
  "한EU",
  "한페루",
  "한미",
  "한튀르키에",
  "한콜롬비아",
  "한호주",
  "한캐나다",
  "한중국",
  "한뉴질랜드",
  "한베트남",
  "한중미",
  "RCEP",
  "한인도네시아",
  "한캄보디아",
  "한필리핀",
  "한-UAE",
  "한영국",
  "한이스라엘",
];

/** 파일 stem → 화면 표시명 */
const STEM_DISPLAY: Record<string, string> = {
  RCEP: "RCEP",
  한EFTA: "한EFTA",
  한EU: "한EU",
  한뉴질랜드: "한뉴질랜드",
  한미: "한미",
  한베트남: "한베트남",
  한싱가포르: "한싱가포르",
  한아랍에미리트: "한-UAE",
  한아세안: "한ASEAN",
  한영국: "한영국",
  한이스라엘과: "한이스라엘",
  한이스라엘: "한이스라엘",
  한인도: "한인도",
  한인도네시아: "한인도네시아",
  한중국: "한중국",
  한중미: "한중미",
  한칠레: "한칠레",
  한캄보디아: "한캄보디아",
  한캐나다: "한캐나다",
  한콜롬비아: "한콜롬비아",
  한튀르키에: "한튀르키에",
  한페루: "한페루",
  한필리핀: "한필리핀",
  한호주: "한호주",
};

function stemToCode(stem: string): string {
  return stem
    .normalize("NFC")
    .replace(/과$/u, "")
    .replace(/[^0-9A-Za-z가-힣]/gu, "")
    .toUpperCase();
}

function displayNameForStem(stem: string): string {
  return STEM_DISPLAY[stem] ?? stem.replace(/과$/u, "");
}

function titleForName(name: string): string {
  if (name === "RCEP") {
    return "[서식] RCEP 원산지증명서의 서식";
  }
  const core = name.replace(/^한-?/u, "").replace(/^한/u, "");
  if (name.startsWith("한") || name.startsWith("한-")) {
    return `[서식] ${core}와의 협정에 따른 원산지증명서의 서식`;
  }
  return `[서식] ${name} 원산지증명서의 서식`;
}

function sortOrderForName(name: string): number {
  const i = AGREEMENT_SORT.indexOf(name);
  return i >= 0 ? i + 1 : 900 + name.charCodeAt(0);
}

export function getFtaOriginCertificateFormDir(): string {
  return (
    process.env.FTA_ORIGIN_CERTIFICATE_FORM_DIR?.trim() ||
    FTA_ORIGIN_CERT_FORM_DIR_DEFAULT
  );
}

export function openFtaOriginCertificateFormDb(readOnly = true): DatabaseSync {
  const p = getSmartLawSqliteDbPath();
  if (!fs.existsSync(p)) {
    throw new Error(`DB 파일이 없습니다: ${p}`);
  }
  return new DatabaseSync(p, { readOnly });
}

export function ensureFtaOriginCertificateFormTable(db: DatabaseSync): void {
  db.exec(CREATE_SQL);
}

function tableReady(db: DatabaseSync): boolean {
  const row = db
    .prepare(
      "SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
    )
    .get(FTA_ORIGIN_CERT_FORM_TABLE) as { ok?: number } | undefined;
  return Boolean(row?.ok);
}

export function countFtaOriginCertificateForms(db: DatabaseSync): number {
  if (!tableReady(db)) return 0;
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM ${FTA_ORIGIN_CERT_FORM_TABLE}`)
    .get() as { n: number };
  return yestradeNum(row?.n);
}

/** 폴더의 PDF를 스캔해 테이블에 반영 */
export function syncFtaOriginCertificateFormsFromDir(
  db: DatabaseSync,
  dir = getFtaOriginCertificateFormDir(),
): { synced: number; dir: string; missingDir: boolean } {
  ensureFtaOriginCertificateFormTable(db);
  const absDir = path.resolve(dir);
  if (!fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) {
    return { synced: 0, dir: absDir, missingDir: true };
  }

  const now = new Date().toISOString();
  const files = fs
    .readdirSync(absDir)
    .filter((n) => n.toLowerCase().endsWith(".pdf"))
    .sort((a, b) => a.localeCompare(b, "ko"));

  const upsert = db.prepare(
    `INSERT INTO ${FTA_ORIGIN_CERT_FORM_TABLE}
      (agreement_code, agreement_name, title, file_name, stored_path,
       file_size, sort_order, source_url, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(agreement_code) DO UPDATE SET
       agreement_name = excluded.agreement_name,
       title = excluded.title,
       file_name = excluded.file_name,
       stored_path = excluded.stored_path,
       file_size = excluded.file_size,
       sort_order = excluded.sort_order,
       source_url = excluded.source_url,
       synced_at = excluded.synced_at`,
  );

  const seen = new Set<string>();
  let synced = 0;
  for (const fileName of files) {
    const stem = path.basename(fileName, path.extname(fileName));
    const agreementName = displayNameForStem(stem);
    const agreementCode = stemToCode(stem);
    if (!agreementCode || seen.has(agreementCode)) continue;
    seen.add(agreementCode);
    const storedPath = path.join(absDir, fileName);
    const fileSize = fs.statSync(storedPath).size;
    upsert.run(
      agreementCode,
      agreementName,
      titleForName(agreementName),
      fileName,
      storedPath,
      fileSize,
      sortOrderForName(agreementName),
      FTA_ORIGIN_CERT_FORM_SOURCE_URL,
      now,
    );
    synced += 1;
  }

  // 폴더에 없는 코드는 삭제하지 않음(수동 등록 보존). 필요 시 별도 정리.
  return { synced, dir: absDir, missingDir: false };
}

function mapRow(
  r: Record<string, unknown>,
): FtaOriginCertificateFormRow {
  const id = yestradeNum(r.id);
  const stored = yestradeStr(r.stored_path);
  let fileExists = false;
  try {
    const abs = resolveYestradeLocalFile(stored);
    fileExists = fs.existsSync(abs);
  } catch {
    fileExists = false;
  }
  return {
    id,
    agreementCode: yestradeStr(r.agreement_code),
    agreementName: yestradeStr(r.agreement_name),
    title: yestradeStr(r.title),
    fileName: yestradeStr(r.file_name),
    fileSize: yestradeNum(r.file_size),
    fileExists,
    previewUrl: `${FILE_API}?id=${id}&disposition=inline`,
    downloadUrl: `${FILE_API}?id=${id}&disposition=attachment`,
    sortOrder: yestradeNum(r.sort_order),
  };
}

export function listFtaOriginCertificateForms(
  db: DatabaseSync,
): FtaOriginCertificateFormRow[] {
  if (!tableReady(db)) return [];
  const rows = db
    .prepare(
      `SELECT id, agreement_code, agreement_name, title, file_name,
              stored_path, file_size, sort_order
         FROM ${FTA_ORIGIN_CERT_FORM_TABLE}
         ORDER BY sort_order ASC, agreement_name ASC`,
    )
    .all() as Record<string, unknown>[];
  return rows.map(mapRow);
}

export function getFtaOriginCertificateFormFile(
  db: DatabaseSync,
  id: number,
): {
  absolutePath: string;
  fileName: string;
  contentType: string;
} | null {
  if (!tableReady(db) || !id) return null;
  const r = db
    .prepare(
      `SELECT file_name, stored_path
         FROM ${FTA_ORIGIN_CERT_FORM_TABLE}
        WHERE id = ?`,
    )
    .get(id) as { file_name?: string; stored_path?: string } | undefined;
  if (!r?.stored_path) return null;
  const absolutePath = resolveYestradeLocalFile(yestradeStr(r.stored_path));
  if (!fs.existsSync(absolutePath)) return null;
  const fileName = yestradeStr(r.file_name) || path.basename(absolutePath);
  return {
    absolutePath,
    fileName,
    contentType: guessYestradeContentType(fileName),
  };
}
