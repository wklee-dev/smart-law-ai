/**
 * 행정규칙 목록 조회 JSON (AdmRulSearch) 파싱
 */

function str(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

export function getAdmRulSearchRoot(parsed: unknown): Record<string, unknown> | null {
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Record<string, unknown>;
  const s = p.AdmRulSearch;
  if (s && typeof s === "object") {
    return s as Record<string, unknown>;
  }
  return p;
}

export type AdmrulListSearchMeta = {
  page: string;
  totalCnt: string;
  numOfRows: string;
  section: string;
  target: string;
  resultCode: string;
  resultMsg: string;
  발령일자: string;
};

export function parseAdmrulListMeta(root: Record<string, unknown>): AdmrulListSearchMeta {
  return {
    page: str(root.page),
    totalCnt: str(root.totalCnt),
    numOfRows: str(root.numOfRows),
    section: str(root.section),
    target: str(root.target),
    resultCode: str(root.resultCode),
    resultMsg: str(root.resultMsg),
    발령일자: str(root.발령일자),
  };
}

export function getAdmrulListItemArray(
  root: Record<string, unknown>,
): Record<string, unknown>[] {
  const a = root["admrul"];
  if (Array.isArray(a)) {
    return a.filter((x) => x && typeof x === "object") as Record<string, unknown>[];
  }
  if (a && typeof a === "object") {
    return [a as Record<string, unknown>];
  }
  return [];
}

export function buildListItemEmbedText(item: Record<string, unknown>): string {
  const lines: string[] = [];
  const push = (label: string, v: unknown) => {
    const s = str(v);
    if (s) lines.push(`${label}: ${s}`);
  };
  push("행정규칙명", item["행정규칙명"]);
  push("행정규칙종류", item["행정규칙종류"]);
  push("소관부처명", item["소관부처명"]);
  push("제개정구분", item["제개정구분명"]);
  push("현행연혁", item["현행연혁구분"]);
  push("발령일자", item["발령일자"]);
  push("발령번호", item["발령번호"]);
  push("시행일자", item["시행일자"]);
  push("행정규칙일련번호", item["행정규칙일련번호"]);
  push("행정규칙ID", item["행정규칙ID"]);
  return lines.join("\n").trim() || str(item["행정규칙명"]) || "행정규칙 목록 항목";
}

export function listItemToRow(
  item: Record<string, unknown>,
  searchRunId: number,
): {
  search_run_id: number;
  result_row_id: string | null;
  adm_serial_id: string;
  adm_lid: string | null;
  rule_name_kr: string | null;
  rule_type: string | null;
  ministry_name: string | null;
  promulgation_date: string | null;
  promulgation_no: string | null;
  enforcement_date: string | null;
  created_record_date: string | null;
  current_history_type: string | null;
  revision_code: string | null;
  revision_name: string | null;
  detail_link: string | null;
  embed_text: string;
  raw_item: object;
} | null {
  const admSerial = str(item["행정규칙일련번호"]);
  if (!admSerial) return null;

  const embedText = buildListItemEmbedText(item);
  const raw =
    item !== null && typeof item === "object"
      ? (item as object)
      : { _value: item };

  return {
    search_run_id: searchRunId,
    result_row_id: str(item["id"]) || null,
    adm_serial_id: admSerial,
    adm_lid: str(item["행정규칙ID"]) || null,
    rule_name_kr: str(item["행정규칙명"]) || null,
    rule_type: str(item["행정규칙종류"]) || null,
    ministry_name: str(item["소관부처명"]) || null,
    promulgation_date: str(item["발령일자"]) || null,
    promulgation_no: str(item["발령번호"]) || null,
    enforcement_date: str(item["시행일자"]) || null,
    created_record_date: str(item["생성일자"]) || null,
    current_history_type: str(item["현행연혁구분"]) || null,
    revision_code: str(item["제개정구분코드"]) || null,
    revision_name: str(item["제개정구분명"]) || null,
    detail_link: str(item["행정규칙상세링크"]) || null,
    embed_text: embedText,
    raw_item: raw,
  };
}
