export type ProcessingStatusItem = {
  /** Excel A열 — 구분 */
  category: string;
  /** Excel B열 — 진행사항 */
  progress: string;
  /** Excel C열 — 대상 */
  name: string;
  /** Excel D열 — 추가진행사항 */
  extraProgress: string;
  /** Excel E열 — 비고 */
  remarks: string;
};

export type ProcessingStatusColumn = {
  key: keyof ProcessingStatusItem;
  label: string;
};

export type ProcessingStatusKind = "done" | "partial" | "ongoing" | "none";

export type ProcessingStatusSummary = {
  total: number;
  done: number;
  partial: number;
  ongoing: number;
  none: number;
};

export type ProcessingStatusCategorySummary = {
  category: string;
  total: number;
};

export type ProcessingStatusProgressSummary = {
  progress: string;
  count: number;
};

export type ProcessingStatusPayload = {
  source: string;
  sheet: string;
  columns: ProcessingStatusColumn[];
  items: ProcessingStatusItem[];
  syncedAt?: string;
  excelModifiedAt?: string;
};

export const PROCESSING_STATUS_FIELD_DEFS: ProcessingStatusColumn[] = [
  { key: "category", label: "구분" },
  { key: "progress", label: "진행사항" },
  { key: "name", label: "대상" },
  { key: "extraProgress", label: "추가진행사항" },
  { key: "remarks", label: "비고" },
];

export const PROCESSING_STATUS_TABLE_COLUMNS: ProcessingStatusColumn[] =
  PROCESSING_STATUS_FIELD_DEFS;

/** @deprecated 상세 열 없음 — Excel 5열 구조 */
export const PROCESSING_STATUS_DETAIL_COLUMNS: ProcessingStatusColumn[] = [];

export function classifyProgress(progress: string): ProcessingStatusKind {
  const p = progress.trim();
  if (!p) return "none";
  if (/완료/.test(p) && !/%/.test(p)) return "done";
  if (/%/.test(p)) return "partial";
  return "ongoing";
}

const CATEGORY_ORDER = ["기존", "추가"];

export function summarizeProcessingStatusByCategory(
  items: ProcessingStatusItem[],
): ProcessingStatusCategorySummary[] {
  const map = new Map<string, number>();

  for (const item of items) {
    const category = item.category.trim() || "미분류";
    map.set(category, (map.get(category) ?? 0) + 1);
  }

  return [...map.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => {
      const ai = CATEGORY_ORDER.indexOf(a.category);
      const bi = CATEGORY_ORDER.indexOf(b.category);
      if (ai !== -1 || bi !== -1) {
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      }
      return a.category.localeCompare(b.category, "ko");
    });
}

/** 진행 단계 순서 — 완료는 마지막(최종) 단계 */
const PROGRESS_ORDER = ["크롤링", "크롤러", "70%완료", "설계완료"];

function compareProgressLabel(a: string, b: string): number {
  if (a === "완료") return 1;
  if (b === "완료") return -1;

  const ai = PROGRESS_ORDER.indexOf(a);
  const bi = PROGRESS_ORDER.indexOf(b);
  if (ai !== -1 && bi !== -1) return ai - bi;
  if (ai !== -1) return -1;
  if (bi !== -1) return 1;
  return a.localeCompare(b, "ko");
}

export function summarizeProcessingStatusByProgress(
  items: ProcessingStatusItem[],
): ProcessingStatusProgressSummary[] {
  const map = new Map<string, number>();

  for (const item of items) {
    const progress = item.progress.trim() || "미정";
    map.set(progress, (map.get(progress) ?? 0) + 1);
  }

  return [...map.entries()]
    .map(([progress, count]) => ({ progress, count }))
    .sort((a, b) => compareProgressLabel(a.progress, b.progress));
}

export function formatCategoryBreakdown(
  items: ProcessingStatusItem[],
): string {
  const rows = summarizeProcessingStatusByCategory(items);
  if (!rows.length) return "";
  return rows.map((row) => `${row.category} ${row.total}`).join(" · ");
}

/** 추가진행사항 등에서 「138건」 형태 숫자 추출 */
export function parseProcessingStatusCount(text: string): number | null {
  const m = text.match(/(\d[\d,]*)\s*건/);
  if (!m?.[1]) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function legacyTargetRow(
  items: ProcessingStatusItem[],
  matchName: (name: string) => boolean,
): ProcessingStatusItem | undefined {
  return items.find(
    (i) => i.category.trim() === "기존" && matchName(i.name.trim()),
  );
}

/** 기존 · 법령정보 공동/공통활용(API) — 추가진행사항 건수 */
export function processingStatusLawApiCount(
  items: ProcessingStatusItem[],
): number | null {
  const row = legacyTargetRow(items, (name) => {
    const compact = name.replace(/\s/g, "").toLowerCase();
    return compact.includes("법령정보") && compact.includes("api");
  });
  if (!row) return null;
  return parseProcessingStatusCount(row.extraProgress);
}

/** 기존 · 행정규칙( CLIP 제외 ) — 추가진행사항 건수 */
export function processingStatusAdminRuleLegacyCount(
  items: ProcessingStatusItem[],
): number | null {
  const row = legacyTargetRow(items, (name) => name === "행정규칙");
  if (!row) return null;
  return parseProcessingStatusCount(row.extraProgress);
}

export function summarizeProcessingStatus(
  items: ProcessingStatusItem[],
): ProcessingStatusSummary {
  const summary: ProcessingStatusSummary = {
    total: items.length,
    done: 0,
    partial: 0,
    ongoing: 0,
    none: 0,
  };

  for (const item of items) {
    summary[classifyProgress(item.progress)] += 1;
  }

  return summary;
}

export function progressLabel(kind: ProcessingStatusKind): string {
  switch (kind) {
    case "done":
      return "완료";
    case "partial":
      return "부분완료";
    case "ongoing":
      return "진행중";
    default:
      return "미정";
  }
}

export function cellText(value: string): string {
  return value.trim();
}

/** 처리현황 Excel/JSON·대시보드에서 제외 (CL 라우트는 URL로만 접근 가능) */
export const PROCESSING_STATUS_EXCLUDED_TARGETS = new Set(["씨엘"]);

/** @deprecated use PROCESSING_STATUS_EXCLUDED_TARGETS */
export const PROCESSING_STATUS_DASHBOARD_EXCLUDE =
  PROCESSING_STATUS_EXCLUDED_TARGETS;

export function isProcessingStatusRowExcluded(item: {
  name: string;
}): boolean {
  return PROCESSING_STATUS_EXCLUDED_TARGETS.has(item.name.trim());
}

export function filterProcessingStatusItems(
  items: ProcessingStatusItem[],
): ProcessingStatusItem[] {
  return items.filter(
    (item) =>
      !isProcessingStatusRowExcluded(item) &&
      classifyProgress(item.progress) !== "none",
  );
}

export function filterProcessingStatusForDashboard(
  items: ProcessingStatusItem[],
): ProcessingStatusItem[] {
  return filterProcessingStatusItems(items);
}

export function filterProcessingStatusPayloadForDashboard(
  payload: ProcessingStatusPayload,
): ProcessingStatusPayload {
  return {
    ...payload,
    items: filterProcessingStatusForDashboard(payload.items),
  };
}
