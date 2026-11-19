/** WBS 「시스템개발현황」 시트 한 행 (smart_law_ai.db `system_dev_status`) */
/** WBS 엑셀·초기 업로드에 해당하는 관리 연도 */
export const DEFAULT_SYSTEM_DEV_STATUS_YEAR = 2025;

/** 조회 조건·신규 항목 기본 연도 = 현재 시스템 연도 */
export function getSystemDevStatusDefaultInquiryYear(): number {
  return new Date().getFullYear();
}

export type SystemDevStatusItem = {
  id: number | null;
  /** 관리 연도 (WBS·엑셀 업로드 단위) */
  year: number;
  systemName: string;
  taskNo: string;
  workArea: string;
  featureType: string;
  menuName: string;
  featureName: string;
  featureDetail: string;
  requestDept: string;
  requester: string;
  devOwner: string;
  workFrequency: string;
  risk: string;
  customerRequestLevel: string;
  evalScore: string;
  devDifficulty: string;
  priority: string;
  requestDate: string;
  expectedDevDays: string;
  planStartDate: string;
  planEndDate: string;
  actualStartDate: string;
  actualEndDate: string;
  testDate: string;
  testCompleteDate: string;
  productionApplyDate: string;
  /** 0~1 (엑셀 1 = 100%) */
  progress: number | null;
  delayReason: string;
  sourceSheet: string;
  sortOrder: number;
  updatedAt: string;
};

export const EMPTY_SYSTEM_DEV_STATUS_ITEM: SystemDevStatusItem = {
  id: null,
  year: DEFAULT_SYSTEM_DEV_STATUS_YEAR,
  systemName: "",
  taskNo: "",
  workArea: "",
  featureType: "",
  menuName: "",
  featureName: "",
  featureDetail: "",
  requestDept: "",
  requester: "",
  devOwner: "",
  workFrequency: "",
  risk: "",
  customerRequestLevel: "",
  evalScore: "",
  devDifficulty: "",
  priority: "",
  requestDate: "",
  expectedDevDays: "",
  planStartDate: "",
  planEndDate: "",
  actualStartDate: "",
  actualEndDate: "",
  testDate: "",
  testCompleteDate: "",
  productionApplyDate: "",
  progress: null,
  delayReason: "",
  sourceSheet: "",
  sortOrder: 0,
  updatedAt: "",
};

export type SystemDevStatusHistoryAction = "create" | "update" | "delete";

export type SystemDevStatusHistoryChange = {
  field: keyof SystemDevStatusItem;
  label: string;
  oldValue: string;
  newValue: string;
};

export type SystemDevStatusHistoryEntry = {
  id: number;
  statusId: number;
  year: number;
  taskNo: string;
  action: SystemDevStatusHistoryAction;
  changes: SystemDevStatusHistoryChange[];
  changedAt: string;
  changedBy: string;
};

/** 이력 비교 대상 (메타 필드 제외) */
export const SYSTEM_DEV_STATUS_HISTORY_FIELD_KEYS = [
  "year",
  "systemName",
  "taskNo",
  "workArea",
  "featureType",
  "menuName",
  "featureName",
  "featureDetail",
  "requestDept",
  "requester",
  "devOwner",
  "workFrequency",
  "risk",
  "customerRequestLevel",
  "evalScore",
  "devDifficulty",
  "priority",
  "requestDate",
  "expectedDevDays",
  "planStartDate",
  "planEndDate",
  "actualStartDate",
  "actualEndDate",
  "testDate",
  "testCompleteDate",
  "productionApplyDate",
  "progress",
  "delayReason",
  "sortOrder",
] as const satisfies readonly (keyof SystemDevStatusItem)[];

export const SYSTEM_DEV_STATUS_FIELD_LABELS: Record<
  (typeof SYSTEM_DEV_STATUS_HISTORY_FIELD_KEYS)[number],
  string
> = {
  year: "년도",
  systemName: "SYSTEM",
  taskNo: "NO",
  workArea: "업무",
  featureType: "기능구분",
  menuName: "메뉴",
  featureName: "기능",
  featureDetail: "기능상세",
  requestDept: "요청부서",
  requester: "요청자",
  devOwner: "개발담당",
  workFrequency: "업무빈도수",
  risk: "RISK",
  customerRequestLevel: "고객요청수준",
  evalScore: "평가점수",
  devDifficulty: "개발난이도",
  priority: "우선순위",
  requestDate: "요청일",
  expectedDevDays: "예상개발일수",
  planStartDate: "개발시작예정일",
  planEndDate: "개발종료예정일",
  actualStartDate: "실제개발시작일",
  actualEndDate: "실제개발완료일",
  testDate: "테스트일",
  testCompleteDate: "테스트완료일",
  productionApplyDate: "운영적용일",
  progress: "진척율",
  delayReason: "지연/기타사유",
  sortOrder: "정렬순서",
};

export function formatSystemDevProgress(
  progress: number | null | undefined,
): string {
  if (progress === null || progress === undefined || Number.isNaN(progress)) {
    return "";
  }
  const p = progress <= 1 ? progress * 100 : progress;
  if (Math.abs(p - Math.round(p)) < 0.001) {
    return `${Math.round(p)}%`;
  }
  return `${p.toFixed(1)}%`;
}
