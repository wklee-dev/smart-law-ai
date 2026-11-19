/** CLIP 일반법령 허용 목록 (엑셀 v4 → JSON) */
import catalogJson from "@/app/data/clip-general-law-list.json";
import type { GeneralLawPortalCategorySlug } from "@/app/shared/general-law-portal-categories";

export type ClipGeneralLawCatalogItem = {
  seq: number;
  menu: string;
  categorySlug: string;
  lawName: string;
  lawNameShort: string;
  lawId: string;
};

export type ClipGeneralLawCatalog = {
  source: string;
  importedAt: string;
  count: number;
  items: ClipGeneralLawCatalogItem[];
};

export const CLIP_GENERAL_LAW_CATALOG =
  catalogJson as ClipGeneralLawCatalog;

/** 엑셀에 남은 폐지 법령ID → 현행 후속 (재임포트·동기화 시 보정) */
export const CLIP_GENERAL_LAW_ID_SUCCESSORS: Record<
  string,
  Pick<ClipGeneralLawCatalogItem, "lawId" | "lawName" | "lawNameShort">
> = {
  "000057": {
    lawId: "012248",
    lawName: "선박의 입항 및 출항 등에 관한 법률(개항질서법 후속)",
    lawNameShort: "선박입출항법",
  },
  "001745": {
    lawId: "012524",
    lawName: "항공안전법(항공법 후속)",
    lawNameShort: "항공안전법",
  },
  "009603": {
    lawId: "014455",
    lawName: "지방자치분권 및 균형성장에 관한 특별법(국가균형발전특별법 후속)",
    lawNameShort: "지방분권균형성장법",
  },
};

export function applyClipGeneralLawSuccessor(
  item: ClipGeneralLawCatalogItem,
): ClipGeneralLawCatalogItem {
  const id = (item.lawId || "").replace(/\D/g, "").padStart(6, "0");
  const succ = CLIP_GENERAL_LAW_ID_SUCCESSORS[id];
  if (!succ) return item;
  return { ...item, ...succ };
}

/** 법령명에서 말미 약칭 괄호 제거 */
export function stripLawNameAbbr(name: string): string {
  return name.replace(/\([^)]*\)\s*$/u, "").trim();
}

export function lawNameMatchKeys(item: ClipGeneralLawCatalogItem): string[] {
  const keys = new Set<string>();
  const add = (s: string) => {
    const t = s.trim();
    if (!t) return;
    keys.add(t);
    keys.add(stripLawNameAbbr(t));
  };
  add(item.lawName);
  add(item.lawNameShort);
  return [...keys].filter(Boolean);
}

export function listClipGeneralLawCatalog(
  categorySlug?: GeneralLawPortalCategorySlug | "all" | null,
): ClipGeneralLawCatalogItem[] {
  const items = CLIP_GENERAL_LAW_CATALOG.items.map(applyClipGeneralLawSuccessor);
  if (!categorySlug || categorySlug === "all") {
    // 전체: lawId 우선 중복 제거, 없으면 법령명
    const seen = new Set<string>();
    const out: ClipGeneralLawCatalogItem[] = [];
    for (const it of items) {
      const key = it.lawId || stripLawNameAbbr(it.lawName);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(it);
    }
    return out;
  }
  return items.filter((it) => it.categorySlug === categorySlug);
}

/** 로컬 본문 없는 법령 — 국가법령정보센터 외부 링크용 ID prefix */
export const LAWGO_DETAIL_PREFIX = "lawgo:";

export function isLawGoDetailId(lawId: string): boolean {
  return lawId.startsWith(LAWGO_DETAIL_PREFIX);
}

export function lawGoKrUrlFromCatalogName(lawName: string): string {
  const name = stripLawNameAbbr(lawName) || lawName.trim();
  return `https://www.law.go.kr/법령/${encodeURIComponent(name)}`;
}
