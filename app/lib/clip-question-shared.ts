/** 클라이언트·서버 공용 — node:fs/sqlite 없음 */

export const CLIP_QUESTION_AREA_TABS = [
  "FTA",
  "통관",
  "심사",
  "조사",
  "공통",
] as const;

export type ClipQuestionAreaTab = (typeof CLIP_QUESTION_AREA_TABS)[number];

export const CLIP_QUESTION_GUBUN_OPTIONS = [
  "민원질의-개인",
  "민원질의-업체",
  "내부질의-본청",
  "내부질의-세관",
  "외부질의-기관",
] as const;

export type ClipQuestionGubun = (typeof CLIP_QUESTION_GUBUN_OPTIONS)[number];

export type ClipQuestionTabCounts = {
  전체: number;
  FTA: number;
  통관: number;
  심사: number;
  조사: number;
  공통: number;
};

export type ClipQuestionListRow = {
  seq_id: string;
  gubun: string;
  category: string;
  title: string;
  receive_date: string;
  reply_date: string;
  reply_dept: string;
};

export type ClipQuestionDetail = ClipQuestionListRow & {
  question_summary: string;
  law_target: string;
  law_basis: string;
  detail_content: string;
  reply_content: string;
};

export const CLIP_QUESTION_SORT_KEYS = [
  "gubun",
  "category",
  "title",
  "receive_date",
  "reply_date",
  "reply_dept",
] as const;

export type ClipQuestionSortKey = (typeof CLIP_QUESTION_SORT_KEYS)[number];

export type ClipQuestionQueryParams = {
  page: number;
  pageSize: number;
  areaTab: "" | "ALL" | ClipQuestionAreaTab;
  gubun: string;
  title: string;
  sort: string | undefined;
  sort_dir: string | undefined;
};

/** 날짜 표시 — YYYY-MM-DD 유지, 빈 값은 — */
export function formatClipQuestionDate(
  v: string | null | undefined,
): string {
  const t = (v ?? "").trim();
  if (!t) return "—";
  const digits = t.replace(/\D/g, "");
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  }
  return t;
}

/**
 * CLIP 질의회신 본문 — DB에 줄바꿈 없이 저장된 상세내용·회신내용을
 * 포털 원문처럼 구조 마커(□, ○, 1., 1) 등) 기준으로 줄바꿈.
 */
export function formatClipQuestionBodyText(
  raw: string | null | undefined,
): string {
  const t0 = (raw ?? "").trim();
  if (!t0) return "";

  // 이미 줄바꿈이 충분하면 그대로 사용
  if ((t0.match(/\n/g)?.length ?? 0) >= 2) return t0;

  let t = t0;

  // 꺾쇠 제목: <질의요지>, <거래관계>
  t = t.replace(/(?<=[^\n])\s*(<[^>]+>)/g, "\n$1");

  // 각주·부서 안내
  t = t.replace(/(?<=[^\n])\s*(\*\s*\()/g, "\n$1");
  t = t.replace(/(?<=[^\n])\s*(※\s*)/g, "\n$1");

  // 번호 목차: 1. 질의 개요, 2. 주요 쟁점
  t = t.replace(/(?<=[^\n])\s+(\d+\.\s+(?=[가-힣]))/g, "\n$1");

  // 원문자 번호: ① ② ③
  t = t.replace(/(?<=[^\n])\s*([①②③④⑤⑥⑦⑧⑨⑩⑪⑫])/g, "\n$1");

  // 닫는 괄호 직후 글머리
  t = t.replace(/\)([□○])/g, ")\n$1");

  // □ ○ ㅇ 글머리
  t = t.replace(/(?<=[^\n])\s*(□\s*)/g, "\n$1");
  t = t.replace(/(?<=[^\n])\s*(○\s*)/g, "\n$1");
  t = t.replace(/(?<=[^\n])\s*(ㅇ\s+)/g, "\n$1");

  // 1) 2) 3) 소목차
  t = t.replace(/(?<=[^\n])\s+(\d+\))/g, "\n$1");

  // 날짜가 있는 대시: - ('10.08.20)
  t = t.replace(/(?<=[^\n])\s+-\s*(?=[\(''‘'"])/g, "\n- ");

  // 입장/상황 뒤 대시 항목
  t = t.replace(/(입장|상황)\s+-\s+/g, "$1\n- ");

  // 갑론/을론: －(갑론)
  t = t.replace(/(?<=[^\n])\s*(－\()/g, "\n$1");

  // 회신 본문: (아래) □
  t = t.replace(/(\(아래\))\s*(□)/g, "$1\n$2");

  return t.replace(/\n{3,}/g, "\n\n").trim();
}
