import "server-only";

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  CLIP_GENERAL_LAW_CATALOG,
  applyClipGeneralLawSuccessor,
  stripLawNameAbbr,
  type ClipGeneralLawCatalogItem,
} from "@/app/lib/clip-general-law-catalog";
import {
  getGwanselawListDbPath,
  listGwanselawItemsFromDb,
  saveGwanselawItemsToDb,
} from "@/app/lib/gwanselaw-list-server";
import { fetchLawOpenApiJson } from "@/app/lib/law-open-api-fetch";
import { saveLawDetailToSqlite } from "@/app/lib/smart-law-sqlite-save";
import { getSmartLawSqliteDbPath } from "@/app/lib/smart-law-sqlite-paths";
import type { ApiManagementListItem } from "@/app/shared/api-management-list";
import { lawIdForStatuteOpenApi, normalizeLawIdForStorage } from "@/app/shared/law-id";

export type SyncGeneralLawResult = {
  ok: boolean;
  catalogUnique: number;
  gwanselawAdded: number;
  gwanselawTotal: number;
  bodyFetchTargets: number;
  bodyOk: number;
  bodyFail: number;
  bodySkip: number;
  addedNames: string[];
  failed: { lawId: string; lawName: string; error: string }[];
  smartDbPath: string;
};

function normalizeId(raw: string): string {
  return normalizeLawIdForStorage(raw);
}

function uniqueCatalogByLawId(): ClipGeneralLawCatalogItem[] {
  const seen = new Set<string>();
  const out: ClipGeneralLawCatalogItem[] = [];
  for (const raw of CLIP_GENERAL_LAW_CATALOG.items) {
    const it = applyClipGeneralLawSuccessor(raw);
    const id = normalizeId(it.lawId);
    const key = id || stripLawNameAbbr(it.lawName);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...it, lawId: id });
  }
  return out;
}

function existingLawIdsInSmart(): Set<string> {
  const p = path.resolve(getSmartLawSqliteDbPath().trim());
  const set = new Set<string>();
  if (!fs.existsSync(p)) return set;
  const db = new DatabaseSync(p, { readOnly: true });
  try {
    const rows = db
      .prepare(`SELECT law_id FROM laws WHERE law_id IS NOT NULL`)
      .all() as { law_id: string }[];
    for (const r of rows) {
      const id = normalizeId(r.law_id);
      if (id) set.add(id);
    }
  } finally {
    db.close();
  }
  return set;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export type SyncClipExcelRowsResult = {
  excelRows: number;
  excelUnique: number;
  added: number;
  updated: number;
  removedStale: number;
  gwanselawTotal: number;
  addedNames: string[];
};

function portalCatOf(item: ApiManagementListItem): string {
  return (item.portalCategory || item.category || "").trim();
}

function clipRowId(lawId: string, categorySlug: string): string {
  return `clip-v4-${lawId}-${categorySlug || "all"}`;
}

/**
 * 일반법령리스트 엑셀 행 전체(메뉴 중복 포함)를 gwanselaw_list에 반영.
 * · 동일 법령ID가 여러 분류에 있으면 분류별 행으로 유지
 * · 엑셀에 있는 법령ID의 기존 행은 엑셀 기준으로 재구성(수신일 등은 가능하면 유지)
 */
export async function syncClipGeneralLawExcelRowsToGwanselaw(): Promise<SyncClipExcelRowsResult> {
  const excelRows = CLIP_GENERAL_LAW_CATALOG.items.map((raw) => {
    const it = applyClipGeneralLawSuccessor(raw);
    return {
      ...it,
      lawId: normalizeId(it.lawId),
      categorySlug: (it.categorySlug || it.menu || "").trim(),
    };
  });
  const excelUnique = uniqueCatalogByLawId().length;
  const excelIds = new Set(
    excelRows.map((r) => r.lawId).filter(Boolean),
  );

  const existing = await listGwanselawItemsFromDb();
  const keepOutsideExcel = existing.filter(
    (item) => !excelIds.has(normalizeId(item.lawId)),
  );

  // 기존 행 재사용: lawId|cat → row, 그리고 lawId별 큐(분류 없는 구행)
  const byLawCat = new Map<string, ApiManagementListItem>();
  const byLawQueue = new Map<string, ApiManagementListItem[]>();
  for (const item of existing) {
    const lawId = normalizeId(item.lawId);
    if (!lawId || !excelIds.has(lawId)) continue;
    const cat = portalCatOf(item);
    const key = `${lawId}|${cat}`;
    if (cat && !byLawCat.has(key)) byLawCat.set(key, item);
    const q = byLawQueue.get(lawId) ?? [];
    q.push(item);
    byLawQueue.set(lawId, q);
  }

  const now = new Date().toISOString().slice(0, 10);
  const excelItems: ApiManagementListItem[] = [];
  const usedIds = new Set<string>();
  let added = 0;
  let updated = 0;
  const addedNames: string[] = [];

  for (let i = 0; i < excelRows.length; i += 1) {
    const it = excelRows[i]!;
    if (!it.lawId) continue;
    const cat = it.categorySlug;
    const key = `${it.lawId}|${cat}`;
    let prev = byLawCat.get(key);
    if (!prev) {
      const q = byLawQueue.get(it.lawId) ?? [];
      while (q.length > 0) {
        const cand = q.shift()!;
        if (usedIds.has(cand.id)) continue;
        prev = cand;
        break;
      }
      byLawQueue.set(it.lawId, q);
    }

    if (prev && !usedIds.has(prev.id)) {
      usedIds.add(prev.id);
      excelItems.push({
        ...prev,
        division: "일반법령",
        category: cat || prev.category || "법령",
        portalCategory: cat,
        apiName: it.lawName || prev.apiName,
        lawShortName: it.lawNameShort || prev.lawShortName,
        lawId: it.lawId,
        fileType: "JSON",
        uploadOrder: i + 1,
      });
      updated += 1;
    } else {
      const id = clipRowId(it.lawId, cat);
      usedIds.add(id);
      excelItems.push({
        id,
        division: "일반법령",
        category: cat || "법령",
        uploadOrder: i + 1,
        apiName: it.lawName,
        lawShortName: it.lawNameShort || "",
        lawId: it.lawId,
        fileType: "JSON",
        portalCategory: cat,
        updatedAt: now,
        lastReceivedEflawJosub: "",
        lastReceivedAdmrulBody: "",
      });
      added += 1;
      addedNames.push(`${it.lawName} (${cat})`);
    }
  }

  const removedStale = existing.length - keepOutsideExcel.length - updated;
  const orderBase = excelItems.length;
  const outside = keepOutsideExcel.map((item, idx) => ({
    ...item,
    uploadOrder: orderBase + idx + 1,
  }));
  const merged = [...excelItems, ...outside];
  await saveGwanselawItemsToDb(merged);

  return {
    excelRows: excelRows.length,
    excelUnique,
    added,
    updated,
    removedStale: Math.max(0, removedStale),
    gwanselawTotal: merged.length,
    addedNames,
  };
}

/** 엑셀 카탈로그 누락분 → gwanselaw_list 추가 후 본문 API → smart_law_ai.db 저장 */
export async function syncClipGeneralLawsFromCatalog(opts?: {
  delayMs?: number;
  fetchBodies?: boolean;
  onlyLawIds?: string[];
}): Promise<SyncGeneralLawResult> {
  const delayMs = opts?.delayMs ?? 350;
  const fetchBodies = opts?.fetchBodies !== false;
  const smartDbPath = path.resolve(getSmartLawSqliteDbPath().trim());
  const catalog = uniqueCatalogByLawId();
  const only = opts?.onlyLawIds?.length
    ? new Set(opts.onlyLawIds.map(normalizeId))
    : null;

  // 목록에는 엑셀 행 전체(메뉴 중복 포함) 반영
  const excelSync = await syncClipGeneralLawExcelRowsToGwanselaw();
  const merged = await listGwanselawItemsFromDb();

  const inSmart = existingLawIdsInSmart();
  const fetchTargets = catalog.filter((it) => {
    if (!it.lawId) return false;
    if (only && !only.has(it.lawId)) return false;
    return !inSmart.has(it.lawId);
  });

  const failed: SyncGeneralLawResult["failed"] = [];
  let bodyOk = 0;
  let bodyFail = 0;
  let bodySkip = 0;

  if (fetchBodies) {
    for (let i = 0; i < fetchTargets.length; i += 1) {
      const it = fetchTargets[i]!;
      try {
        const apiId = lawIdForStatuteOpenApi(it.lawId);
        const res = await fetchLawOpenApiJson({
          target: "eflaw",
          ID: apiId,
          type: "JSON",
        });
        if (!res.ok || !res.parsedJson || typeof res.parsedJson !== "object") {
          bodyFail += 1;
          failed.push({
            lawId: it.lawId,
            lawName: it.lawName,
            error: `API ${res.status}: ${(res.rawText || "").slice(0, 180)}`,
          });
        } else {
          const raw = res.parsedJson as Record<string, unknown>;
          // 법령 래퍼 없으면 실패로
          if (!raw["법령"] && !(raw as { Law?: unknown }).Law) {
            bodyFail += 1;
            failed.push({
              lawId: it.lawId,
              lawName: it.lawName,
              error: "응답에 법령 본문이 없습니다.",
            });
          } else {
            saveLawDetailToSqlite(raw);
            bodyOk += 1;
            inSmart.add(it.lawId);
          }
        }
      } catch (e) {
        bodyFail += 1;
        failed.push({
          lawId: it.lawId,
          lawName: it.lawName,
          error: e instanceof Error ? e.message : String(e),
        });
      }
      if (i < fetchTargets.length - 1) await sleep(delayMs);
    }
  } else {
    bodySkip = fetchTargets.length;
  }

  return {
    ok: bodyFail === 0,
    catalogUnique: catalog.length,
    gwanselawAdded: excelSync.added,
    gwanselawTotal: merged.length,
    bodyFetchTargets: fetchTargets.length,
    bodyOk,
    bodyFail,
    bodySkip,
    addedNames: excelSync.addedNames,
    failed,
    smartDbPath,
  };
}

export function getGwanselawDbPathForLog(): string {
  return getGwanselawListDbPath();
}
