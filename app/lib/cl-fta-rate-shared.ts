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
