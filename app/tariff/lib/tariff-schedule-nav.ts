import { parseHsSearchInput } from "@/app/tariff/lib/tariff-hs-display";

const STORAGE_KEY = "tariffScheduleNav";

export type TariffScheduleNavContext = {
  countryCode: string;
  year: number;
  sectionCode: string;
  chapterCode: string;
  headingCode: string;
};

export function saveTariffScheduleNav(ctx: TariffScheduleNavContext): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ctx));
  } catch {
    /* quota 등 무시 */
  }
}

export function loadTariffScheduleNav(): TariffScheduleNavContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TariffScheduleNavContext;
    if (!parsed?.countryCode || !parsed?.chapterCode) return null;
    return parsed;
  } catch {
    return null;
  }
}

export type TariffHsLookupResult = {
  ok: true;
  countryCode: string;
  year: number;
  hsCode: string;
  matchedHsCode: string;
  headingCode: string;
  chapterCode: string;
  sectionCode: string;
  itemName: string;
  itemNameEn: string;
};

/** HS 코드 → tariff_item 조회 (국내관세율 상세목록 이동용) */
export async function lookupTariffHs(
  countryCode: string,
  year: number,
  hsInput: string,
): Promise<TariffHsLookupResult> {
  const hsDigits = parseHsSearchInput(hsInput);
  if (!hsDigits) {
    throw new Error("HS 코드 형식이 올바르지 않습니다.");
  }
  const params = new URLSearchParams({
    countryCode,
    year: String(year),
    hsCode: hsDigits,
  });
  const res = await fetch(`/api/tariff/schedule/hs-lookup?${params}`, {
    cache: "no-store",
  });
  const data = (await res.json()) as TariffHsLookupResult & {
    ok: boolean;
    error?: string;
  };
  if (!res.ok || !data.ok) {
    throw new Error(data.error || "HS 조회 실패");
  }
  return data;
}

export function saveNavFromHsLookup(
  countryCode: string,
  year: number,
  lookup: Pick<
    TariffHsLookupResult,
    "sectionCode" | "chapterCode" | "headingCode"
  >,
): void {
  saveTariffScheduleNav({
    countryCode,
    year,
    sectionCode: lookup.sectionCode,
    chapterCode: lookup.chapterCode,
    headingCode: lookup.headingCode,
  });
}
