import "server-only";

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  LAWGO_DETAIL_PREFIX,
  lawNameMatchKeys,
  listClipGeneralLawCatalog,
  stripLawNameAbbr,
  type ClipGeneralLawCatalogItem,
} from "@/app/lib/clip-general-law-catalog";
import { SMART_LAW_DETAIL_PREFIX } from "@/app/lib/raw-rule-server";
import { getSmartLawSqliteDbPath } from "@/app/lib/smart-law-sqlite-paths";
import type { GeneralLawPortalCategorySlug } from "@/app/shared/general-law-portal-categories";

export type ClipGeneralLawTreeNode = {
  id: string;
  lawId: string;
  lawName: string;
  docType: "법률" | "시행령" | "시행규칙" | "고시" | "훈령" | "공고" | "예규" | "기타";
  lawType: string;
  enforcementDate: string | null;
  promulgationDate: string | null;
  promulgationNumber: string | null;
  department: string | null;
  virtual?: boolean;
  children: ClipGeneralLawTreeNode[];
};

export type ClipGeneralLawMissingItem = {
  lawId: string;
  lawName: string;
  categorySlug: string;
  foundInAlternate: boolean;
  alternateDbPath: string | null;
};

export type ClipGeneralLawAlternateDb = {
  path: string;
  exists: boolean;
  matchedCount: number;
  label: string;
};

type SmartMeta = {
  lawId: string;
  lawName: string;
  enforcementDate: string | null;
  promulgationDate: string | null;
  promulgationNumber: string | null;
  department: string | null;
  lawType: string;
};

function stmtAll<T>(db: DatabaseSync, sql: string, params: unknown[] = []): T[] {
  return db.prepare(sql).all(...params) as T[];
}

function normalizeLawId(raw: string | null | undefined): string {
  const s = String(raw ?? "").replace(/\D/g, "");
  return s ? s.padStart(6, "0") : "";
}

function openSmartDb(): DatabaseSync | null {
  const p = path.resolve(getSmartLawSqliteDbPath().trim());
  if (!fs.existsSync(p)) return null;
  return new DatabaseSync(p, { readOnly: true });
}

function loadSmartIndex(): {
  byId: Map<string, SmartMeta>;
  byName: Map<string, SmartMeta>;
} {
  const byId = new Map<string, SmartMeta>();
  const byName = new Map<string, SmartMeta>();
  const db = openSmartDb();
  if (!db) return { byId, byName };

  const rows = stmtAll<{
    law_id: string;
    law_name_kr: string;
    law_type_name: string | null;
    promulgation_no: string | null;
    promulgation_date: string | null;
    enforcement_date: string | null;
    contact_department_name: string | null;
    ministry_name: string | null;
  }>(
    db,
    `
    SELECT
      l.law_id,
      l.law_name_kr,
      l.law_type_name,
      v.promulgation_no,
      v.promulgation_date,
      v.enforcement_date,
      v.contact_department_name,
      l.ministry_name
    FROM laws l
    INNER JOIN law_versions v ON v.law_id = l.id AND v.is_current = 1
    `,
  );

  for (const r of rows) {
    const id = normalizeLawId(r.law_id);
    const meta: SmartMeta = {
      lawId: id || String(r.law_id),
      lawName: r.law_name_kr,
      enforcementDate: r.enforcement_date,
      promulgationDate: r.promulgation_date,
      promulgationNumber: r.promulgation_no,
      department: r.contact_department_name ?? r.ministry_name,
      lawType: r.law_type_name?.trim() || "법률",
    };
    if (id) byId.set(id, meta);
    for (const key of [r.law_name_kr, stripLawNameAbbr(r.law_name_kr)]) {
      if (key && !byName.has(key)) byName.set(key, meta);
    }
  }
  return { byId, byName };
}

function resolveSmartMeta(
  item: ClipGeneralLawCatalogItem,
  byId: Map<string, SmartMeta>,
  byName: Map<string, SmartMeta>,
): SmartMeta | null {
  const id = normalizeLawId(item.lawId);
  if (id && byId.has(id)) return byId.get(id)!;
  for (const key of lawNameMatchKeys(item)) {
    if (byName.has(key)) return byName.get(key)!;
  }
  return null;
}

function nodeFromSmart(
  item: ClipGeneralLawCatalogItem,
  smart: SmartMeta,
): ClipGeneralLawTreeNode {
  const lawType = smart.lawType || "법률";
  const docType = lawType.includes("법률")
    ? "법률"
    : lawType.includes("대통령령") || lawType.includes("시행령")
      ? "시행령"
      : "기타";
  return {
    id: `${SMART_LAW_DETAIL_PREFIX}${smart.lawId}`,
    lawId: `${SMART_LAW_DETAIL_PREFIX}${smart.lawId}`,
    lawName: item.lawName,
    docType,
    lawType,
    enforcementDate: smart.enforcementDate,
    promulgationDate: smart.promulgationDate,
    promulgationNumber: smart.promulgationNumber,
    department: smart.department,
    children: [],
  };
}

/** smart_law에 없어도 엑셀 대상 법령은 목록에 표시(국가법령정보센터 링크) */
function nodeFromCatalogOnly(
  item: ClipGeneralLawCatalogItem,
): ClipGeneralLawTreeNode {
  const id = normalizeLawId(item.lawId);
  const key = id || stripLawNameAbbr(item.lawName) || item.lawName;
  return {
    id: `${LAWGO_DETAIL_PREFIX}${key}`,
    lawId: `${LAWGO_DETAIL_PREFIX}${key}`,
    lawName: item.lawName,
    docType: "법률",
    lawType: "법률",
    enforcementDate: null,
    promulgationDate: null,
    promulgationNumber: null,
    department: null,
    children: [],
  };
}

/** 엑셀 허용 목록을 항목별로 트리 구성(smart_law 본문 있으면 로컬, 없으면 law.go.kr 링크) */
export function buildClipGeneralLawTree(
  categorySlug: GeneralLawPortalCategorySlug | "all",
): {
  tree: ClipGeneralLawTreeNode[];
  missing: ClipGeneralLawMissingItem[];
  alternateDbs: ClipGeneralLawAlternateDb[];
  smartDbPath: string;
  smartDbExists: boolean;
} {
  const smartDbPath = path.resolve(getSmartLawSqliteDbPath().trim());
  const smartDbExists = fs.existsSync(smartDbPath);
  const catalog = listClipGeneralLawCatalog(categorySlug);
  const { byId, byName } = loadSmartIndex();

  const tree: ClipGeneralLawTreeNode[] = [];

  for (const item of catalog) {
    const smart = resolveSmartMeta(item, byId, byName);
    if (smart) {
      tree.push(nodeFromSmart(item, smart));
    } else {
      tree.push(nodeFromCatalogOnly(item));
    }
  }

  // 누락·다른 DB 안내는 UI에서 제거 — API 호환용으로만 빈 배열 유지
  return {
    tree,
    missing: [],
    alternateDbs: [],
    smartDbPath,
    smartDbExists,
  };
}

export function getClipGeneralLawTreeStats(
  categorySlug: GeneralLawPortalCategorySlug | "all",
) {
  const { tree, smartDbPath, smartDbExists } =
    buildClipGeneralLawTree(categorySlug);
  const byDocType: Record<string, number> = {};
  let inSmartLaw = 0;
  for (const n of tree) {
    byDocType[n.docType] = (byDocType[n.docType] ?? 0) + 1;
    if (!n.lawId.startsWith(LAWGO_DETAIL_PREFIX)) inSmartLaw += 1;
  }
  return {
    totalRows: tree.length,
    rootGroups: tree.length,
    catalogCount: listClipGeneralLawCatalog(categorySlug).length,
    inSmartLaw,
    missingCount: 0,
    missingInAlternate: 0,
    byDocType,
    noticeRows: 0,
    smartDbPath,
    smartDbExists,
    alternateDbs: [] as ClipGeneralLawAlternateDb[],
    source: "smart_law_ai.db",
  };
}

export { LAWGO_DETAIL_PREFIX };
