/**
 * 표준 버튼 액션 — 명칭·아이콘·기본 variant 매핑.
 * 라벨은 기능 확인 후 선택. 단순 텍스트 치환용 아님.
 */
export const BUTTON_ACTIONS = {
  lookup: {
    label: "조회",
    icon: "search",
    variant: "primary",
    description: "조건 기반 데이터 불러오기",
  },
  search: {
    label: "검색",
    icon: "search-check",
    variant: "primary",
    description: "문서 내 키워드 찾기",
  },
  reset: {
    label: "초기화",
    icon: "rotate-ccw",
    variant: "outline",
    description: "조건을 기본 상태로 되돌리기",
  },
  clearResult: {
    label: "결과 지우기",
    icon: "eraser",
    variant: "outline",
    description: "조회 결과만 제거(검색조건 유지)",
  },
  detail: {
    label: "상세보기",
    icon: "eye",
    variant: "outline",
    description: "상세내용 열기",
  },
  close: {
    label: "닫기",
    icon: "x",
    variant: "outline",
    description: "모달 종료",
  },
  confirm: {
    label: "확인",
    icon: "check",
    variant: "primary",
    description: "선택·입력 확정",
  },
  save: {
    label: "저장",
    icon: "save",
    variant: "primary",
    description: "데이터 저장",
  },
  create: {
    label: "등록",
    icon: "plus",
    variant: "primary",
    description: "새로운 자료 생성",
  },
  edit: {
    label: "수정",
    icon: "pencil",
    variant: "outline",
    description: "기존 자료 편집",
  },
  remove: {
    label: "삭제",
    icon: "trash-2",
    variant: "danger",
    description: "자료 삭제",
  },
  download: {
    label: "다운로드",
    icon: "download",
    variant: "outline",
    description: "일반 파일 다운로드",
  },
  excel: {
    label: "엑셀 다운로드",
    icon: "file-spreadsheet",
    variant: "outline",
    description: "Excel 파일 생성",
  },
  print: {
    label: "인쇄",
    icon: "printer",
    variant: "outline",
    description: "인쇄",
  },
  copy: {
    label: "복사",
    icon: "copy",
    variant: "outline",
    description: "클립보드 복사",
  },
  prev: {
    label: "이전",
    icon: "arrow-left",
    variant: "outline",
    description: "이전 단계·페이지",
  },
  next: {
    label: "다음",
    icon: "arrow-right",
    variant: "outline",
    description: "다음 단계·페이지",
  },
  login: {
    label: "로그인",
    icon: "log-in",
    variant: "primary",
    description: "인증 폼 제출",
  },
} as const;

export type ButtonAction = keyof typeof BUTTON_ACTIONS;

export type ButtonIconName =
  | (typeof BUTTON_ACTIONS)[ButtonAction]["icon"]
  | "spinner";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "danger"
  | "ghost";

export type ButtonSize = "small" | "medium" | "large";
