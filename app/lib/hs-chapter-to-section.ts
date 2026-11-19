/**
 * HS 협약: 류(2자리 장 번호) → 부(section) 코드(01–21).
 * hs_manual_meta 의 부 행 manl_ut_sgn 과 일치.
 */
const CHAPTER_TO_SECTION_RANGES: readonly (readonly [
  chapterFrom: number,
  chapterTo: number,
  sectionCode: string,
])[] = [
  [1, 5, "01"],
  [6, 14, "02"],
  [15, 15, "03"],
  [16, 24, "04"],
  [25, 27, "05"],
  [28, 38, "06"],
  [39, 40, "07"],
  [41, 43, "08"],
  [44, 46, "09"],
  [47, 49, "10"],
  [50, 63, "11"],
  [64, 67, "12"],
  [68, 70, "13"],
  [71, 71, "14"],
  [72, 83, "15"],
  [84, 85, "16"],
  [86, 89, "17"],
  [90, 92, "18"],
  [93, 93, "19"],
  [94, 96, "20"],
  [97, 97, "21"],
];

export function sectionCodeForChapterNumber(chapterNum: number): string {
  if (!Number.isFinite(chapterNum) || chapterNum < 1 || chapterNum > 97) {
    return "01";
  }
  for (const [lo, hi, sec] of CHAPTER_TO_SECTION_RANGES) {
    if (chapterNum >= lo && chapterNum <= hi) return sec;
  }
  return "01";
}

/** 부(01~21) 코드 → 그 부에 속하는 첫 류(장)의 2자리 부호 */
export function firstChapterCodeForSection(sectionCode: string): string {
  const sec = (sectionCode ?? "").trim().padStart(2, "0");
  for (const [lo, , s] of CHAPTER_TO_SECTION_RANGES) {
    if (s === sec) return String(lo).padStart(2, "0");
  }
  return "01";
}

/** 류 부호 "01"~"97" 또는 호 부호 "0101" 등에서 류 2자리 추출 → 부 코드 */
export function sectionCodeFromHsSgn(manlUtTpcd: string, manlUtSgn: string): string {
  const sgn = (manlUtSgn ?? "").trim();
  if (!sgn) return "01";
  if (manlUtTpcd === "01") return sgn.slice(0, 2).padStart(2, "0");
  const digits = sgn.replace(/\D/g, "");
  const ch =
    manlUtTpcd === "03"
      ? parseInt(digits.slice(0, 2) || "0", 10)
      : parseInt(digits.slice(0, 2) || sgn.slice(0, 2) || "0", 10);
  if (!Number.isFinite(ch) || ch <= 0) return "01";
  return sectionCodeForChapterNumber(ch);
}
