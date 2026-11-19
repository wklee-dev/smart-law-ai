/**
 * Excel `01_크롤링대상` E열 법령(법률) · OPEN API 법령조회 목록 → gwanselaw_list(법령 본문 API) 반영
 */
import { randomUUID } from "node:crypto";
import type { AdminRulesCrawlTarget } from "@/app/lib/admin-rules-crawl-targets-server";
import {
  getLawStatuteCrawlTargets,
  normalizeCrawlTargetRuleName,
} from "@/app/lib/admin-rules-crawl-targets-server";
import {
  CLIP_GENERAL_LAW_ID_SUCCESSORS,
} from "@/app/lib/clip-general-law-catalog";
import {
  listGwanselawItemsFromDb,
  saveGwanselawItemsToDb,
} from "@/app/lib/gwanselaw-list-server";
import {
  listOpenlawLawsWithCrawlTargets,
  type OpenlawLawSummary,
} from "@/app/lib/openlaw-sqlite-server";
import type { ApiManagementListItem } from "@/app/shared/api-management-list";
import { normalizeLawIdForStorage } from "@/app/shared/law-id";

function resolveCrawlLawIdAndName(
  rawLawId: string,
  rawName: string,
): { lawId: string; lawName: string } {
  const lawId = normalizeLawIdForStorage(rawLawId || "");
  const succ = lawId ? CLIP_GENERAL_LAW_ID_SUCCESSORS[lawId] : undefined;
  if (!succ) return { lawId, lawName: rawName };
  return { lawId: succ.lawId, lawName: succ.lawName };
}

export type LawStatuteCrawlSyncResult = {
  added: number;
  updated: number;
  skippedExisting: number;
  skippedNoLawId: number;
  addedNames: string[];
  updatedNames: string[];
};

function gwanselawNameKey(name: string): string {
  return normalizeCrawlTargetRuleName(name).toLowerCase();
}

function crawlTargetPortalCategory(target: AdminRulesCrawlTarget): string {
  return target.portalLawType || target.lawTypeCode || "크롤링대상";
}

function crawlTargetToGwanselawItem(
  target: AdminRulesCrawlTarget,
  uploadOrder: number,
): ApiManagementListItem {
  const lawId = normalizeLawIdForStorage(target.portalLawId || "");
  const stableId = lawId
    ? `crawl-statute-${lawId}`
    : `crawl-statute-${randomUUID()}`;

  return {
    id: stableId,
    division: "일반법령",
    category: "법령",
    uploadOrder,
    apiName: target.lawName,
    lawShortName: "",
    lawId,
    fileType: "JSON",
    portalCategory: crawlTargetPortalCategory(target),
    updatedAt: "",
    lastReceivedEflawJosub: "",
    lastReceivedAdmrulBody: "",
  };
}

function applyExcelTargetToItem(
  item: ApiManagementListItem,
  target: AdminRulesCrawlTarget,
  lawId: string,
): ApiManagementListItem {
  return {
    ...item,
    apiName: target.lawName || item.apiName,
    lawId,
    fileType: "JSON",
    portalCategory: crawlTargetPortalCategory(target),
    id: item.id.startsWith("crawl-statute-") || !item.lawId.trim()
      ? `crawl-statute-${lawId}`
      : item.id,
  };
}

/**
 * Excel 법령(법률) 크롤링 대상을 gwanselaw_list에 맞춥니다.
 * · 미등록 → 추가
 * · 법령명은 같고 Excel 법령ID만 다른 경우 → Excel ID로 갱신
 * · 본문 수집 여부와 무관하게 Excel 대상은 목록에 포함
 */
export async function syncLawStatuteCrawlTargetsToGwanselaw(): Promise<LawStatuteCrawlSyncResult> {
  const crawlBundle = getLawStatuteCrawlTargets();
  if (!crawlBundle) {
    return {
      added: 0,
      updated: 0,
      skippedExisting: 0,
      skippedNoLawId: 0,
      addedNames: [],
      updatedNames: [],
    };
  }

  let items = await listGwanselawItemsFromDb();
  const byLawId = new Map<string, ApiManagementListItem>();
  const byName = new Map<string, ApiManagementListItem>();
  const byId = new Set(items.map((item) => item.id));

  for (const item of items) {
    const lawId = normalizeLawIdForStorage(item.lawId);
    if (lawId && !byLawId.has(lawId)) byLawId.set(lawId, item);
    const nameKey = gwanselawNameKey(item.apiName);
    if (nameKey && !byName.has(nameKey)) byName.set(nameKey, item);
  }

  let added = 0;
  let updated = 0;
  let skippedExisting = 0;
  let skippedNoLawId = 0;
  const addedNames: string[] = [];
  const updatedNames: string[] = [];

  let orderBase =
    items.reduce((max, item) => Math.max(max, item.uploadOrder), 0) + 1;

  const replaceItem = (next: ApiManagementListItem) => {
    items = items.map((item) => (item.id === next.id ? next : item));
  };

  for (const target of crawlBundle.targets) {
    const resolved = resolveCrawlLawIdAndName(
      target.portalLawId || "",
      target.lawName,
    );
    const lawId = resolved.lawId;
    const resolvedTarget =
      resolved.lawName === target.lawName
        ? target
        : { ...target, lawName: resolved.lawName, portalLawId: lawId };
    const nameKey = gwanselawNameKey(resolvedTarget.lawName);

    if (lawId && byLawId.has(lawId)) {
      skippedExisting += 1;
      continue;
    }

    if (nameKey && byName.has(nameKey)) {
      const prev = byName.get(nameKey)!;
      const prevLawId = normalizeLawIdForStorage(prev.lawId);

      if (lawId && prevLawId !== lawId) {
        const next = applyExcelTargetToItem(prev, resolvedTarget, lawId);
        if (next.id !== prev.id) {
          byId.delete(prev.id);
          byId.add(next.id);
        }
        replaceItem(next);
        if (prevLawId) byLawId.delete(prevLawId);
        byLawId.set(lawId, next);
        byName.set(nameKey, next);
        updated += 1;
        updatedNames.push(resolvedTarget.lawName);
        continue;
      }

      skippedExisting += 1;
      continue;
    }

    if (!lawId) {
      // Excel 법령ID 없음 — 목록에는 추가(법령ID는 나중에 보완)
    }

    const item = crawlTargetToGwanselawItem(resolvedTarget, orderBase);
    orderBase += 1;

    if (byId.has(item.id)) {
      skippedExisting += 1;
      continue;
    }

    items.push(item);
    added += 1;
    addedNames.push(resolvedTarget.lawName);
    byId.add(item.id);
    if (lawId) byLawId.set(lawId, item);
    if (nameKey) byName.set(nameKey, item);
  }

  if (added > 0 || updated > 0) {
    await saveGwanselawItemsToDb(items);
  }

  return {
    added,
    updated,
    skippedExisting,
    skippedNoLawId,
    addedNames,
    updatedNames,
  };
}

function openlawLawIdForStorage(raw: string): string {
  const id = normalizeLawIdForStorage(raw);
  if (!id || !/^\d+$/.test(id)) return "";
  return id;
}

function openlawLawToGwanselawItem(
  law: OpenlawLawSummary,
  uploadOrder: number,
): ApiManagementListItem {
  const lawId = openlawLawIdForStorage(law.lawId);
  const stableId = lawId
    ? `crawl-statute-${lawId}`
    : `openlaw-${randomUUID()}`;

  const docType = (law.crawlDocumentType || law.lawType || "").trim();
  const category =
    docType.includes("규칙") || docType.includes("고시") ? "행정규칙" : "법령";

  return {
    id: stableId,
    division: "일반법령",
    category,
    uploadOrder,
    apiName: law.lawName.trim(),
    lawShortName: (law.lawAbbr ?? "").trim(),
    lawId,
    fileType: "JSON",
    portalCategory: docType || law.deptNm?.trim() || "OPEN API",
    updatedAt: "",
    lastReceivedEflawJosub: "",
    lastReceivedAdmrulBody: "",
  };
}

function applyOpenlawLawToItem(
  item: ApiManagementListItem,
  law: OpenlawLawSummary,
  lawId: string,
): ApiManagementListItem {
  const docType = (law.crawlDocumentType || law.lawType || "").trim();
  return {
    ...item,
    apiName: law.lawName.trim() || item.apiName,
    lawShortName: (law.lawAbbr ?? "").trim() || item.lawShortName,
    lawId: lawId || item.lawId,
    fileType: "JSON",
    portalCategory: docType || item.portalCategory || "OPEN API",
    id:
      lawId && (item.id.startsWith("crawl-statute-") || !item.lawId.trim())
        ? `crawl-statute-${lawId}`
        : item.id,
  };
}

/**
 * OPEN API 법령조회(`listOpenlawLawsWithCrawlTargets`) 목록 중
 * gwanselaw_list(법령 본문 API)에 없는 항목을 추가합니다.
 */
export async function syncOpenlawInquiryListToGwanselaw(): Promise<LawStatuteCrawlSyncResult> {
  const { laws } = listOpenlawLawsWithCrawlTargets();
  if (laws.length === 0) {
    return {
      added: 0,
      updated: 0,
      skippedExisting: 0,
      skippedNoLawId: 0,
      addedNames: [],
      updatedNames: [],
    };
  }

  let items = await listGwanselawItemsFromDb();
  const byLawId = new Map<string, ApiManagementListItem>();
  const byName = new Map<string, ApiManagementListItem>();
  const byId = new Set(items.map((item) => item.id));

  for (const item of items) {
    const lawId = normalizeLawIdForStorage(item.lawId);
    if (lawId && !byLawId.has(lawId)) byLawId.set(lawId, item);
    const nameKey = gwanselawNameKey(item.apiName);
    if (nameKey && !byName.has(nameKey)) byName.set(nameKey, item);
  }

  let added = 0;
  let updated = 0;
  let skippedExisting = 0;
  let skippedNoLawId = 0;
  const addedNames: string[] = [];
  const updatedNames: string[] = [];

  let orderBase =
    items.reduce((max, item) => Math.max(max, item.uploadOrder), 0) + 1;

  const replaceItem = (next: ApiManagementListItem) => {
    items = items.map((item) => (item.id === next.id ? next : item));
  };

  for (const law of laws) {
    const lawId = openlawLawIdForStorage(law.lawId);
    const nameKey = gwanselawNameKey(law.lawName);

    if (lawId && byLawId.has(lawId)) {
      skippedExisting += 1;
      continue;
    }

    if (nameKey && byName.has(nameKey)) {
      const prev = byName.get(nameKey)!;
      const prevLawId = normalizeLawIdForStorage(prev.lawId);

      if (lawId && prevLawId !== lawId) {
        const next = applyOpenlawLawToItem(prev, law, lawId);
        if (next.id !== prev.id) {
          byId.delete(prev.id);
          byId.add(next.id);
        }
        replaceItem(next);
        if (prevLawId) byLawId.delete(prevLawId);
        byLawId.set(lawId, next);
        byName.set(nameKey, next);
        updated += 1;
        updatedNames.push(law.lawName);
        continue;
      }

      skippedExisting += 1;
      continue;
    }

    if (!lawId && !nameKey) {
      skippedNoLawId += 1;
      continue;
    }

    const item = openlawLawToGwanselawItem(law, orderBase);
    orderBase += 1;

    if (byId.has(item.id)) {
      skippedExisting += 1;
      continue;
    }

    items.push(item);
    added += 1;
    addedNames.push(law.lawName);
    byId.add(item.id);
    if (lawId) byLawId.set(lawId, item);
    if (nameKey) byName.set(nameKey, item);
  }

  if (added > 0 || updated > 0) {
    await saveGwanselawItemsToDb(items);
  }

  return {
    added,
    updated,
    skippedExisting,
    skippedNoLawId,
    addedNames,
    updatedNames,
  };
}
