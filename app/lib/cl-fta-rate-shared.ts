export type ClFtaNationRow = {
  fta_cd: string;
  fta_nm: string;
  nation_nm: string;
  cert_desc: string;
  psr_desc: string;
  effect_dt: string;
  treaty_url: string;
  sort_no: number;
  base_yr: string;
  rate_count: number;
};

export type ClFtaGeneralRow = {
  fta_cd: string;
  sect: string;
  gubun: string;
  content: string;
};

export type ClFtaRateCdRow = {
  rate_cd: string;
  fta_cd: string;
  nation_nm: string;
  grp_nm: string;
  sort_no: number;
};

export type ClFtaRateListRow = {
  fta_cd: string;
  fta_nm: string;
  hsk_cd: string;
  hs2: string;
  hs4: string;
  hs6: string;
  hs2_nm: string;
  hsk_nm: string;
  hsk_nm_en: string;
  rate_cd: string;
  nation_nm: string;
  grp_nm: string;
  rate_txt: string;
  rate_val: number | null;
  row_no: number;
};

export type ClFtaPsrRef = {
  ref_fta: string;
  psr_id: string;
  seq_no: number;
};

export type ClFtaPsrRow = {
  fta_cd: string;
  hs2: string;
  psr_txt: string;
  note_txt: string;
  base_desc: string;
  refs: ClFtaPsrRef[];
};

export type ClFtaPsrDetailRow = {
  gubun: string;
  content: string;
  seq_no: number;
};

export type ClFtaPsrDetail = {
  ref_fta: string;
  psr_id: string;
  rows: ClFtaPsrDetailRow[];
  note: string;
};

export type ClFtaHs2Option = {
  hs2: string;
  hs2_nm: string;
  n: number;
};

export type ClFtaAttachRow = {
  fta_cd: string;
  doc_gb: string;
  file_nm: string;
  file_url: string;
  save_path: string;
};

/** 협정 안내 화면 — 자체 DB(조약·법령·고시·서식·집행지침) 링크 */
export type ClFtaGuideLink = {
  label: string;
  note: string;
  href: string;
};

export type ClFtaAnnexCell = {
  cs: number;
  rs: number;
  blocks: ClFtaAnnexBlock[];
};

/** 별표 HWP 에서 뽑은 본문 (fta_annex_doc.blocks_json) */
export type ClFtaAnnexBlock =
  | { t: "p"; text: string }
  | { t: "table"; rows: ClFtaAnnexCell[][] };

export type ClFtaAnnexDoc = {
  label: string;
  href: string;
  blocks: ClFtaAnnexBlock[];
};

export type ClFtaGuide = {
  treaties: ClFtaGuideLink[];
  laws: ClFtaGuideLink[];
  certForms: ClFtaGuideLink[];
  certItems: ClFtaAnnexDoc[];
  guidance: ClFtaGuideLink[];
  /** 세율부호 → 관세율구분코드 공식 명칭 (TRRT_TPCD) */
  rateCodeNames: Record<string, string>;
  /** 세율부호 접미 국가코드 → 국가명 (예: CH → 스위스) */
  memberNames: Record<string, string>;
  recom: ClFtaAnnexDoc[];
  psrGuide: ClFtaAnnexDoc[];
};

/** 협정관세추천 대상품목 */
export type ClFtaRecomRow = {
  fta_cd: string;
  item_nm: string;
  seq_no: number;
  hsk_cd: string;
  hsk_disp: string;
  hsk_nm: string;
  qty_txt: string;
  agency: string;
};
