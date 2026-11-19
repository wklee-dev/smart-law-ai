/**
 * law_articles / law_article_items 저장 시 DB 제약과 타입(정수 article_no, item_level 체크)에 맞춘 매핑.
 */

function articleNoPrimaryInt(articleNo: string): number | null {
  const t = (articleNo ?? "").trim();
  if (!t) return null;
  const m = /^(\d+)/.exec(t);
  if (m) return parseInt(m[1], 10);
  return null;
}

/**
 * (law_version_id, article_no) 유일 제약 대응.
 * `article_no`가 정수 컬럼일 때 문자열 접미사(예: "1__키")가 어딘가에서 앞자리만 파싱되어
 * 모두 1로 들어가는 경우가 있어, 충돌 시에는 별도 숫자 대역만 사용한다.
 */
export function uniqueArticleNoForDb(
  articleNo: string,
  articleKey: string,
  order: number,
  used: Set<number>,
): number {
  let primary = articleNoPrimaryInt(articleNo);
  if (primary === null || !Number.isFinite(primary)) {
    primary = 1000000 + order;
  }
  let candidate = primary;
  if (!used.has(candidate)) {
    used.add(candidate);
    return candidate;
  }
  let salt = 0;
  for (let i = 0; i < (articleKey ?? "").length; i++) {
    salt = (salt * 31 + (articleKey ?? "").charCodeAt(i)) >>> 0;
  }
  candidate = 2000000000 + (salt % 100000000) + order * 1000;
  if (candidate > 2147483647) {
    candidate = 2147480000 + (order % 10000) + (salt % 10000);
  }
  let n = 0;
  while (used.has(candidate)) {
    n += 1;
    candidate = 2000000000 + (salt % 100000000) + order * 1000 + n;
    if (candidate > 2147483647) candidate = 2147483647 - n;
  }
  used.add(candidate);
  return candidate;
}

/**
 * DB `depth` / `level` 제약: 보통 항=1, 호=2, 목=3 (1 이상).
 * 0을 넣으면 chk_law_article_items_level 등에서 위반되는 경우가 많다.
 */
export function itemSemanticLevel(level: string): number {
  switch (level) {
    case "항":
      return 1;
    case "호":
      return 2;
    case "목":
      return 3;
    default:
      return 1;
  }
}

/** DB `item_level` 컬럼 — 제약이 한글 값만 허용하는 경우가 많다. */
export function itemLevelToDb(level: string): string {
  switch (level) {
    case "항":
      return "항";
    case "호":
      return "호";
    case "목":
      return "목";
    default:
      return "항";
  }
}

/** API/UI 표시용 (레거시 영문 코드 및 DB 한글) */
export function itemLevelToDisplay(db: string): string {
  switch (db) {
    case "HANG":
      return "항";
    case "HO":
      return "호";
    case "MOK":
      return "목";
    case "항":
    case "호":
    case "목":
      return db;
    default:
      return db;
  }
}
