export type TariffItemRow = {
  hs_code: string;
  item_name: string;
  item_name_en: string;
  basic_rate: string;
  elastic_rate: string;
  elastic_codes: string;
  elastic_rates: string;
  fta_rate: string;
  temp_rate: string;
  special_rate: string;
};

export function normalizeHsDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** 검색창 입력이 HS 코드인지 판별 (4~10자리 숫자·구분기호) */
export function parseHsSearchInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!/^[\d\s.\-_]+$/.test(trimmed)) return null;
  const digits = normalizeHsDigits(trimmed).slice(0, 10);
  if (digits.length < 4) return null;
  return digits;
}

export function normalizeHeadingCode(raw: string): string {
  const d = normalizeHsDigits(raw);
  if (!d.length) return "";
  return d.length >= 4 ? d.slice(0, 4) : d.padStart(4, "0");
}

/** HS 코드를 4·2·나머지 열로 분리 (원본 관세율표 UI) */
export function splitHsCodeColumns(hsCode: string): {
  col4: string;
  col2: string;
  colRest: string;
  depth: number;
} {
  const d = normalizeHsDigits(hsCode);
  if (d.length <= 4) {
    return { col4: d, col2: "", colRest: "", depth: 0 };
  }
  if (d.length <= 6) {
    return { col4: d.slice(0, 4), col2: d.slice(4), colRest: "", depth: 1 };
  }
  return {
    col4: d.slice(0, 4),
    col2: d.slice(4, 6),
    colRest: d.slice(6),
    depth: 2,
  };
}

export function formatHsCodeSpaced(hs: string): string {
  const { col4, col2, colRest } = splitHsCodeColumns(hs);
  if (!col4) return "—";
  if (!col2) return col4;
  if (!colRest) return `${col4} ${col2}`;
  return `${col4} ${col2} ${colRest}`;
}

/** 화면용 HS 코드 (0101.21-1000) */
export function formatHsCodeDotted(hs: string): string {
  const d = normalizeHsDigits(hs);
  if (d.length <= 4) return d || "—";
  if (d.length <= 6) return `${d.slice(0, 4)}.${d.slice(4)}`;
  return `${d.slice(0, 4)}.${d.slice(4, 6)}-${d.slice(6)}`;
}

export type FlexibleRatePair = { code: string; rate: string };

/** DB elastic_rate 구분자: | ¦ │ 등 */
const ELASTIC_RATE_SEP = /\s*[|¦│｜]\s*/;

function tokenizeElasticCodes(raw: string): string[] {
  return raw
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => /^[A-Za-z0-9]+$/.test(s));
}

function tokenizeElasticRates(raw: string): string[] {
  const t = raw.trim();
  if (!t) return [];
  const matched = t.match(/\d+(?:\.\d+)?%/g);
  if (matched?.length) return matched;
  return t
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(normalizeElasticRateValue);
}

function normalizeElasticRateValue(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (t.endsWith("%")) return t;
  if (/^\d+(?:\.\d+)?$/.test(t)) return `${t}%`;
  return t;
}

function zipFlexibleRatePairs(
  codes: string[],
  rates: string[],
): FlexibleRatePair[] {
  const n = Math.max(codes.length, rates.length);
  const pairs: FlexibleRatePair[] = [];
  for (let i = 0; i < n; i++) {
    const code = codes[i] ?? "";
    const rate = rates[i] ?? "";
    if (code || rate) pairs.push({ code, rate });
  }
  return pairs;
}

/** `C E2 E3 | 6.6% 0% 0%` → [{code:'C',rate:'6.6%'}, ...] */
export function parseFlexibleRatePairs(r: TariffItemRow): FlexibleRatePair[] {
  const codesCol = (r.elastic_codes ?? "").trim();
  const ratesCol = (r.elastic_rates ?? "").trim();
  if (codesCol && ratesCol) {
    return zipFlexibleRatePairs(
      tokenizeElasticCodes(codesCol),
      tokenizeElasticRates(ratesCol),
    );
  }

  const elastic = (r.elastic_rate ?? "").trim();
  if (elastic) {
    const parts = elastic.split(ELASTIC_RATE_SEP);
    if (parts.length >= 2) {
      return zipFlexibleRatePairs(
        tokenizeElasticCodes(parts[0]),
        tokenizeElasticRates(parts.slice(1).join(" ")),
      );
    }
    const single = elastic.match(/^([A-Za-z0-9]+)\s+(\d+(?:\.\d+)?%?)$/);
    if (single) {
      return [
        {
          code: single[1],
          rate: normalizeElasticRateValue(single[2]),
        },
      ];
    }
    return [{ code: "", rate: elastic }];
  }

  const fallback = [r.fta_rate, r.temp_rate, r.special_rate]
    .map((s) => (s ?? "").trim())
    .find(Boolean);
  if (!fallback) return [];
  if (ELASTIC_RATE_SEP.test(fallback)) {
    const parts = fallback.split(ELASTIC_RATE_SEP);
    return zipFlexibleRatePairs(
      tokenizeElasticCodes(parts[0]),
      tokenizeElasticRates(parts.slice(1).join(" ")),
    );
  }
  return [{ code: "", rate: fallback }];
}

/** 링크·빈칸 판별용 (원문 요약) */
export function flexibleRateText(r: TariffItemRow): string {
  const pairs = parseFlexibleRatePairs(r);
  if (pairs.length) {
    return pairs.map((p) => [p.code, p.rate].filter(Boolean).join(" ")).join(" ");
  }
  const elastic = (r.elastic_rate ?? "").trim();
  if (elastic) return elastic.replace(/\s*\|\s*/g, " ");
  const parts = [r.fta_rate, r.temp_rate, r.special_rate].map((s) =>
    (s ?? "").trim(),
  );
  return parts.find(Boolean) || "";
}

/** 원본 UNIPASS: 단위(중량/수량) — unit_weight / unit_qty */
export function formatTariffUnitWeightQty(
  unitWeight?: string | null,
  unitQty?: string | null,
): string {
  const w = (unitWeight ?? "").trim();
  const q = (unitQty ?? "").trim();
  if (w && q) return `${w} / ${q}`;
  return w || q || "";
}

/** 세율 표시: 없으면 공백(대시 없음) */
export function displayTariffRateValue(raw: string): string {
  const t = (raw ?? "").trim();
  if (!t || t === "—" || t === "-") return "";
  return t;
}

/** 10자리 완전 HS 코드 — 국내관세율상세 링크 가능 */
export function isTariffDetailLinkable(row: TariffItemRow): boolean {
  return normalizeHsDigits(row.hs_code).length >= 10;
}

export function buildTariffDetailHref(opts: {
  hsCode: string;
  countryCode: string;
  year: number;
  sectionCode?: string;
  chapterCode?: string;
  headingCode?: string;
  embed?: boolean;
}): string {
  const q = new URLSearchParams({
    hsCode: normalizeHsDigits(opts.hsCode),
    countryCode: opts.countryCode.toUpperCase(),
    year: String(opts.year),
  });
  if (opts.sectionCode?.trim()) q.set("sectionCode", opts.sectionCode.trim());
  if (opts.chapterCode?.trim()) q.set("chapterCode", opts.chapterCode.trim());
  if (opts.headingCode?.trim()) {
    q.set("headingCode", normalizeHeadingCode(opts.headingCode));
  }
  if (opts.embed) q.set("embed", "1");
  return `/item-classification/tariff-schedule/detail?${q.toString()}`;
}

/** 국내관세율 상세목록(호) 페이지 URL */
export function buildTariffHeadingHref(opts: {
  countryCode: string;
  year: number;
  sectionCode: string;
  chapterCode: string;
  headingCode: string;
  hsCode?: string;
  embed?: boolean;
}): string {
  const q = new URLSearchParams({
    countryCode: opts.countryCode.toUpperCase(),
    year: String(opts.year),
    sectionCode: opts.sectionCode.trim(),
    chapterCode: opts.chapterCode.trim(),
    headingCode: normalizeHeadingCode(opts.headingCode),
  });
  if (opts.hsCode?.trim()) {
    q.set("hsCode", normalizeHsDigits(opts.hsCode));
  }
  if (opts.embed) q.set("embed", "1");
  return `/item-classification/tariff-schedule/heading?${q.toString()}`;
}

/** iframe(embed=1) 컨텍스트 여부 */
export function isTariffEmbedContext(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("embed") === "1";
}

export function withTariffEmbedParam(q: URLSearchParams): URLSearchParams {
  if (isTariffEmbedContext()) q.set("embed", "1");
  return q;
}

/** headingCode(4자리)에서 류 코드(2자리) 추론 */
export function chapterCodeFromHeading(headingCode: string): string {
  const h = normalizeHeadingCode(headingCode);
  if (h.length < 2) return "";
  return h.slice(0, 2).padStart(2, "0");
}

/**
 * HS 품목번호 정렬 키 (부·류·호 계층, 숫자 인식).
 * 10자리 미만 코드는 뒤를 0으로 채워 비교 (0101 → 0101000000).
 */
export function hsCodeNumericSortKey(hsCode: string): number {
  const d = normalizeHsDigits(hsCode);
  if (!d.length) return 0;
  const padded = (d + "0000000000").slice(0, 10);
  return Number.parseInt(padded, 10);
}

export function compareTariffItemsByHsCode(
  a: { hs_code: string },
  b: { hs_code: string },
): number {
  const ka = hsCodeNumericSortKey(a.hs_code);
  const kb = hsCodeNumericSortKey(b.hs_code);
  if (ka !== kb) return ka - kb;
  return normalizeHsDigits(a.hs_code).length - normalizeHsDigits(b.hs_code).length;
}

export function sortTariffItemsByHsCode<T extends { hs_code: string }>(
  items: T[],
): T[] {
  return [...items].sort(compareTariffItemsByHsCode);
}

/** SQLite ORDER BY 절용: 품목번호 숫자 계층 정렬 */
export function hsCodeNumericOrderSql(columnExpr: string): string {
  return `CAST(substr(replace(trim(${columnExpr}),' ','') || '0000000000', 1, 10) AS INTEGER)`;
}
