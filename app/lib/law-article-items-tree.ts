/**
 * law_article_items 행을 포털 본문 순서(부모→자식)로 표시용 1차원 리스트로 변환.
 * Supabase는 id·FK를 문자열 또는 bigint로 줄 수 있어, Map 키와 재귀 시 반드시 동일한 숫자로 맞춘다.
 */

export type LawArticleItemRowInput = {
  id: unknown;
  parent_item_id: unknown;
  item_level?: string;
  item_no: string;
  item_content: string;
  item_order: unknown;
  [key: string]: unknown;
};

export type LawArticleItemDisplayRow<T extends LawArticleItemRowInput> =
  T & { depth: number };

/** id / FK 공통 정규화 (number | string | bigint 등) */
export function normalizeLawItemNumericId(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "bigint") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof raw === "string") {
    const t = raw.trim();
    if (t === "" || t === "null") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normalizeParentItemId(raw: unknown): number | null {
  return normalizeLawItemNumericId(raw);
}

function compareItemOrderThenId(a: LawArticleItemRowInput, b: LawArticleItemRowInput): number {
  const oa = Number(a.item_order ?? 0);
  const ob = Number(b.item_order ?? 0);
  const od = oa - ob;
  if (od !== 0) return od;
  const ia = normalizeLawItemNumericId(a.id) ?? 0;
  const ib = normalizeLawItemNumericId(b.id) ?? 0;
  return ia - ib;
}

/**
 * parent_item_id 트리를 깊이 우선으로 펼침(루트 항 → 해당 호·목).
 * 형제 정렬: display_order(item_order) → id.
 */
export function flattenLawArticleItemTree<T extends LawArticleItemRowInput>(
  items: T[],
): Array<LawArticleItemDisplayRow<T>> {
  const childrenMap = new Map<number | null, T[]>();

  for (const item of items) {
    const p = normalizeParentItemId(item.parent_item_id);
    const list = childrenMap.get(p) ?? [];
    list.push(item);
    childrenMap.set(p, list);
  }

  for (const siblings of childrenMap.values()) {
    siblings.sort(compareItemOrderThenId);
  }

  const rows: Array<LawArticleItemDisplayRow<T>> = [];

  const walk = (parentId: number | null, depth: number) => {
    const children = childrenMap.get(parentId) ?? [];
    for (const child of children) {
      rows.push({ ...child, depth });
      const cid = normalizeLawItemNumericId(child.id);
      if (cid !== null && cid >= 0) {
        walk(cid, depth + 1);
      }
    }
  };

  walk(null, 0);
  return rows;
}
