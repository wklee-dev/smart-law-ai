import "server-only";

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  lawNameMatchKeys,
  listClipGeneralLawCatalog,
  stripLawNameAbbr,
  type ClipGeneralLawCatalogItem,
} from "@/app/lib/clip-general-law-catalog";
import { getRawRuleDbPath } from "@/app/lib/raw-rule-db-paths";
import { getSmartLawSqliteDbPath } from "@/app/lib/smart-law-sqlite-paths";
import { saveLawDetailToSqlite } from "@/app/lib/smart-law-sqlite-save";
import type { GeneralLawPortalCategorySlug } from "@/app/shared/general-law-portal-categories";

function normalizeLawId(raw: string | null | undefined): string {
  const s = String(raw ?? "").replace(/\D/g, "");
  return s ? s.padStart(6, "0") : "";
}

function stmtAll<T>(db: DatabaseSync, sql: string, params: unknown[] = []): T[] {
  return db.prepare(sql).all(...params) as T[];
}

type RawHit = {
  law_id: string | null;
  law_name: string;
  law_type: string;
  promulgation_date: string | null;
  promulgation_number: string | null;
  enforcement_date: string | null;
  department: string | null;
  content: string | null;
};

function findRawRow(
  db: DatabaseSync,
  item: ClipGeneralLawCatalogItem,
): RawHit | null {
  for (const key of lawNameMatchKeys(item)) {
    const row = db
      .prepare(
        `
        SELECT law_id, law_name, law_type, promulgation_date, promulgation_number,
               enforcement_date, department, content
        FROM raw
        WHERE law_name = ? OR law_name LIKE ?
        ORDER BY CASE WHEN law_type LIKE '%법률%' THEN 0 ELSE 1 END, length(IFNULL(content,'')) DESC
        LIMIT 1
        `,
      )
      .get(key, `${stripLawNameAbbr(key)}%`) as RawHit | undefined;
    if (row) return row;
  }
  return null;
}

function toLawServiceJson(
  item: ClipGeneralLawCatalogItem,
  raw: RawHit,
): Record<string, unknown> {
  const lawId = normalizeLawId(item.lawId || raw.law_id || "") || "000000";
  const promDate = (raw.promulgation_date || "").replace(/\D/g, "");
  const enfDate = (raw.enforcement_date || "").replace(/\D/g, "");
  const lawType = (raw.law_type || "법률").trim() || "법률";
  return {
    법령: {
      법령키: `clip-import-${lawId}`,
      기본정보: {
        법령ID: lawId,
        법령명_한글: stripLawNameAbbr(item.lawName) || item.lawName,
        법령명약칭: item.lawNameShort || "",
        법종구분: { content: lawType, 법종구분코드: "" },
        소관부처: { content: raw.department || "", 소관부처코드: "" },
        공포번호: raw.promulgation_number || "",
        공포일자: promDate,
        시행일자: enfDate,
        제개정구분: "",
        언어: "한글",
      },
      조문: {
        조문단위: [
          {
            조문번호: "1",
            조문여부: "조문",
            조문제목: "본문",
            조문내용:
              (raw.content || "").trim() ||
              "(본문 없음 — 다른 DB에서 이전)",
          },
        ],
      },
    },
  };
}

export function importMissingGeneralLawsFromAlternateDb(input: {
  categorySlug: GeneralLawPortalCategorySlug | "all";
  sourceDbPath?: string;
  lawIds?: string[];
}): {
  ok: boolean;
  sourceDbPath: string;
  targetDbPath: string;
  attempted: number;
  imported: number;
  skipped: number;
  errors: string[];
  importedNames: string[];
} {
  const targetDbPath = path.resolve(getSmartLawSqliteDbPath().trim());
  const sourceDbPath = path.resolve(
    (input.sourceDbPath || getRawRuleDbPath()).trim(),
  );

  if (!fs.existsSync(sourceDbPath)) {
    return {
      ok: false,
      sourceDbPath,
      targetDbPath,
      attempted: 0,
      imported: 0,
      skipped: 0,
      errors: [`출처 DB 없음: ${sourceDbPath}`],
      importedNames: [],
    };
  }
  if (!fs.existsSync(targetDbPath)) {
    return {
      ok: false,
      sourceDbPath,
      targetDbPath,
      attempted: 0,
      imported: 0,
      skipped: 0,
      errors: [`대상 DB 없음: ${targetDbPath}`],
      importedNames: [],
    };
  }

  const catalog = listClipGeneralLawCatalog(input.categorySlug);
  const filterIds = input.lawIds?.length
    ? new Set(input.lawIds.map(normalizeLawId))
    : null;

  // 이미 smart에 있는 ID
  const smart = new DatabaseSync(targetDbPath, { readOnly: true });
  const existing = new Set(
    stmtAll<{ law_id: string }>(smart, `SELECT law_id FROM laws`).map((r) =>
      normalizeLawId(r.law_id),
    ),
  );

  const missing = catalog.filter((c) => {
    const id = normalizeLawId(c.lawId);
    if (filterIds && !filterIds.has(id)) return false;
    return !id || !existing.has(id);
  });

  // name-level existing check
  const existingNames = new Set(
    stmtAll<{ law_name_kr: string }>(
      smart,
      `SELECT law_name_kr FROM laws`,
    ).flatMap((r) => [r.law_name_kr, stripLawNameAbbr(r.law_name_kr)]),
  );

  const toImport = missing.filter(
    (m) => !lawNameMatchKeys(m).some((k) => existingNames.has(k)),
  );

  const source = new DatabaseSync(sourceDbPath, { readOnly: true });
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];
  const importedNames: string[] = [];

  for (const item of toImport) {
    try {
      const raw = findRawRow(source, item);
      if (!raw) {
        skipped += 1;
        continue;
      }
      const json = toLawServiceJson(item, raw);
      saveLawDetailToSqlite(json);
      imported += 1;
      importedNames.push(item.lawName);
    } catch (e) {
      errors.push(
        `${item.lawName}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return {
    ok: errors.length === 0,
    sourceDbPath,
    targetDbPath,
    attempted: toImport.length,
    imported,
    skipped,
    errors,
    importedNames,
  };
}
