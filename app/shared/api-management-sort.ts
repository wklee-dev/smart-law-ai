/**
 * API 관리 목록 정렬
 * 1) 분류(category) 고정 순서
 * 2) 동일 분류 내 uploadOrder(업로드/엑셀 행 순서)
 */

export const API_MANAGEMENT_CATEGORY_ORDER = [
  "법령",
  "관세관련",
  "무역관련",
  "외국환관련",
  "세관장확인관련",
  "통합공고관련",
  "내국세관련",
] as const;

export type ApiManagementCategory =
  (typeof API_MANAGEMENT_CATEGORY_ORDER)[number];

/** 분류 표시·정렬 우선순위 (목록에 없는 분류는 맨 뒤, 가나다순) */
export function categorySortRank(category: string): number {
  const c = category.trim();
  const idx = API_MANAGEMENT_CATEGORY_ORDER.indexOf(
    c as ApiManagementCategory,
  );
  if (idx >= 0) return idx;
  return API_MANAGEMENT_CATEGORY_ORDER.length;
}

export function compareApiManagementItems<
  T extends { category: string; uploadOrder?: number; apiName?: string },
>(a: T, b: T): number {
  const cat = categorySortRank(a.category) - categorySortRank(b.category);
  if (cat !== 0) return cat;

  const ao =
    typeof a.uploadOrder === "number" && Number.isFinite(a.uploadOrder)
      ? a.uploadOrder
      : Number.MAX_SAFE_INTEGER;
  const bo =
    typeof b.uploadOrder === "number" && Number.isFinite(b.uploadOrder)
      ? b.uploadOrder
      : Number.MAX_SAFE_INTEGER;
  if (ao !== bo) return ao - bo;

  return (a.apiName ?? "").localeCompare(b.apiName ?? "", "ko");
}

export function sortApiManagementList<
  T extends { category: string; uploadOrder?: number; apiName?: string },
>(items: T[]): T[] {
  return [...items].sort(compareApiManagementItems);
}

export function nextUploadOrder(
  items: { uploadOrder?: number }[],
): number {
  let max = 0;
  for (const item of items) {
    const n = item.uploadOrder;
    if (typeof n === "number" && Number.isFinite(n) && n > max) {
      max = n;
    }
  }
  return max + 1;
}
