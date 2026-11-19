/**
 * gwanselaw_list 테이블 한 행의 공통 형식 (smart_law_ai.db).
 * API: GET/POST /api/api-management/save
 * updatedAt: API 관리 화면에서 수동으로 쓰는 최종수신일.
 * lastReceived*: 각 호출 화면에서 API 성공 시만 갱신 (서로 독립).
 */

import { sortApiManagementList } from "./api-management-sort";
import { normalizeLawIdForStorage } from "./law-id";

export type ApiManagementFileType = "XML" | "JSON" | "CSV";

export type ApiManagementListItem = {
  id: string;
  division: string;
  category: string;
  /** 엑셀·신규 등록 순서 (분류 내 2차 정렬) */
  uploadOrder: number;
  apiName: string;
  /** 법령약칭명 (국가법령정보 API) */
  lawShortName: string;
  lawId: string;
  fileType: ApiManagementFileType;
  /** 포털 분류(관세관련 등). 비어 있으면 API 관리 category 사용 */
  portalCategory?: string;
  updatedAt: string;
  lastReceivedEflawJosub: string;
  lastReceivedAdmrulBody: string;
};

export function normalizeApiManagementListItem(
  item: Partial<ApiManagementListItem> & Record<string, unknown>,
): ApiManagementListItem {
  const ft = item.fileType;
  const fileType: ApiManagementFileType =
    ft === "JSON" || ft === "CSV" ? ft : "XML";

  return {
    id: typeof item.id === "string" && item.id ? item.id : crypto.randomUUID(),
    division: typeof item.division === "string" ? item.division : "",
    category: typeof item.category === "string" ? item.category : "",
    uploadOrder:
      typeof item.uploadOrder === "number" && Number.isFinite(item.uploadOrder)
        ? Math.trunc(item.uploadOrder)
        : 0,
    apiName: typeof item.apiName === "string" ? item.apiName : "",
    lawShortName:
      typeof item.lawShortName === "string" ? item.lawShortName.trim() : "",
    lawId: normalizeLawIdForStorage(
      typeof item.lawId === "string" ? item.lawId : "",
    ),
    portalCategory:
      typeof item.portalCategory === "string" ? item.portalCategory.trim() : "",
    fileType,
    updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : "",
    lastReceivedEflawJosub:
      typeof item.lastReceivedEflawJosub === "string"
        ? item.lastReceivedEflawJosub
        : "",
    lastReceivedAdmrulBody:
      typeof item.lastReceivedAdmrulBody === "string"
        ? item.lastReceivedAdmrulBody
        : "",
  };
}

function pickRicherText(a: string, b: string): string {
  const left = a.trim();
  const right = b.trim();
  if (left && right) return left >= right ? left : right;
  return left || right;
}

function mergeApiManagementItems(
  keep: ApiManagementListItem,
  other: ApiManagementListItem,
): ApiManagementListItem {
  const ao = keep.uploadOrder > 0 ? keep.uploadOrder : 0;
  const bo = other.uploadOrder > 0 ? other.uploadOrder : 0;

  return {
    ...keep,
    category: "법령",
    lawId: keep.lawId.trim() || other.lawId.trim(),
    lawShortName: pickRicherText(keep.lawShortName, other.lawShortName),
    apiName: pickRicherText(keep.apiName, other.apiName) || keep.apiName,
    updatedAt: pickRicherText(keep.updatedAt, other.updatedAt),
    lastReceivedEflawJosub: pickRicherText(
      keep.lastReceivedEflawJosub,
      other.lastReceivedEflawJosub,
    ),
    lastReceivedAdmrulBody: pickRicherText(
      keep.lastReceivedAdmrulBody,
      other.lastReceivedAdmrulBody,
    ),
    uploadOrder: ao && bo ? Math.min(ao, bo) : ao || bo,
  };
}

function apiManagementNameKey(item: ApiManagementListItem): string {
  return [
    item.division.trim(),
    item.fileType,
    item.apiName.trim().replace(/\s+/g, " "),
    // 일반법령리스트 메뉴 중복(동일 법령·다른 분류)은 별도 행으로 유지
    (item.portalCategory || "").trim(),
  ].join("|");
}

function apiManagementLawDedupeKey(item: ApiManagementListItem): string {
  if (!item.lawId) return `no-law:${item.id}`;
  const cat = (item.portalCategory || "").trim();
  // portalCategory가 있으면 법령ID+분류 단위로 유지(엑셀 169행 반영)
  return cat ? `law:${item.lawId}|cat:${cat}` : `law:${item.lawId}`;
}

/**
 * 동일 법령ID(+포털분류) 중복 + 동일(구분·타입·제공API명·분류)인데 법령ID만 비어 있는 중복을 합칩니다.
 * (엑셀 재업로드 등으로 ID 있는 행과 없는 행이 같이 쌓인 경우)
 */
export function dedupeApiManagementList(
  items: ApiManagementListItem[],
): ApiManagementListItem[] {
  const byLaw = new Map<string, ApiManagementListItem>();
  const lawKeys: string[] = [];

  for (const item of items) {
    const row: ApiManagementListItem = {
      ...item,
      category: item.category.trim() || "법령",
    };
    const key = apiManagementLawDedupeKey(row);

    if (!byLaw.has(key)) {
      byLaw.set(key, row);
      lawKeys.push(key);
      continue;
    }

    byLaw.set(key, mergeApiManagementItems(byLaw.get(key)!, row));
  }

  const afterLaw = lawKeys.map((key) => byLaw.get(key)!);

  const byName = new Map<string, ApiManagementListItem>();
  const nameKeys: string[] = [];

  for (const row of afterLaw) {
    const nk = apiManagementNameKey(row);
    if (!byName.has(nk)) {
      byName.set(nk, row);
      nameKeys.push(nk);
      continue;
    }

    const keep = byName.get(nk)!;
    const keepHasId = Boolean(keep.lawId.trim());
    const rowHasId = Boolean(row.lawId.trim());

    if (keepHasId && rowHasId && keep.lawId !== row.lawId) {
      // 같은 이름·다른 법령ID — 드묾. 법령ID 키로 별도 유지
      const alt = `name-law:${row.lawId}|${nk}`;
      if (!byName.has(alt)) {
        byName.set(alt, row);
        nameKeys.push(alt);
      } else {
        byName.set(alt, mergeApiManagementItems(byName.get(alt)!, row));
      }
      continue;
    }

    if (!keepHasId && rowHasId) {
      byName.set(nk, mergeApiManagementItems(row, keep));
    } else {
      byName.set(nk, mergeApiManagementItems(keep, row));
    }
  }

  return nameKeys.map((key) => byName.get(key)!);
}

/** 정규화 → 중복 제거 → 정렬 → 정렬순서 1부터 재부여 */
export function prepareApiManagementList(
  items: (Partial<ApiManagementListItem> & Record<string, unknown>)[],
): ApiManagementListItem[] {
  const normalized = items.map((item) => normalizeApiManagementListItem(item));
  const deduped = dedupeApiManagementList(normalized);
  const sorted = sortApiManagementList(deduped);

  return sorted.map((item, index) => ({
    ...item,
    uploadOrder: index + 1,
  }));
}

/** 법령 본문 API(api-call) 좌측 목록에서 숨길 제공API명 */
const API_CALL_EXCLUDED_API_NAMES = new Set(["현행법령(시행일) 목록 조회"]);

export function isExcludedFromApiCallList(
  item: Pick<ApiManagementListItem, "apiName">,
): boolean {
  return API_CALL_EXCLUDED_API_NAMES.has(item.apiName.trim());
}

export function filterApiCallList(
  items: ApiManagementListItem[],
): ApiManagementListItem[] {
  return items.filter((item) => !isExcludedFromApiCallList(item));
}
