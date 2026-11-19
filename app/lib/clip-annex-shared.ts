/** CLIP 별표·서식 — anxFrmlTpcd (포털 별표구분) */
export const CLIP_ANNEX_TYPE_TABS = [
  { code: "01", label: "별표" },
  { code: "02", label: "서식" },
  { code: "03", label: "별도" },
  { code: "04", label: "부록" },
] as const;

export type ClipAnnexTypeCode = (typeof CLIP_ANNEX_TYPE_TABS)[number]["code"];

export type ClipAnnexTabKey = "ALL" | ClipAnnexTypeCode;

export const CLIP_ANNEX_SORT_KEYS = [
  "law_name",
  "annex_type_code",
  "form_title",
  "effective_date",
] as const;

export type ClipAnnexSortKey = (typeof CLIP_ANNEX_SORT_KEYS)[number];

export type ClipAnnexTabCounts = Record<ClipAnnexTabKey, number>;

export type ClipAnnexListRow = {
  form_key: string;
  law_name: string;
  annex_type_code: string;
  annex_type_label: string;
  form_title: string;
  effective_date: string;
  law_kind_label: string;
  has_pdf: boolean;
  has_hwp: boolean;
  pdf_attachment_id: string;
  hwp_attachment_id: string;
};

export type ClipAnnexFileRow = {
  attachment_id: string;
  file_type: string;
  original_filename: string;
  download_status: string;
  byte_size: number | null;
  last_error: string;
};

export type ClipAnnexDetail = {
  form_key: string;
  law_name: string;
  annex_type_code: string;
  annex_type_label: string;
  form_title: string;
  effective_date: string;
  law_kind_label: string;
  files: ClipAnnexFileRow[];
};

export type ClipAnnexQueryParams = {
  page: number;
  pageSize: number;
  tab: ClipAnnexTabKey;
  lawName: string;
  formTitle: string;
  sort: string | null | undefined;
  sort_dir: string | null | undefined;
};

const ANNEX_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  CLIP_ANNEX_TYPE_TABS.map((t) => [t.code, t.label]),
);

export function clipAnnexTypeLabel(code: string | null | undefined): string {
  const c = (code ?? "").trim();
  return ANNEX_TYPE_LABEL[c] ?? (c || "—");
}

export function formatClipAnnexDate(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (/^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  return s || "—";
}
