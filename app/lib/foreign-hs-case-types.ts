/** 클라이언트·서버 공통 (서버 전용 모듈 미포함). */
export type ForeignCaseListRow = {
  id: number;
  prlst_clsf_srno: string | null;
  country: string | null;
  enforce_date: string | null;
  ref_no: string | null;
  hs_code: string | null;
  image_count: number;
  goods_preview_org: string;
  goods_preview_eng: string;
  goods_preview_kor: string;
};

export type ForeignBucketSearchResult = {
  rows: ForeignCaseListRow[];
  total: number;
  page: number;
  pageSize: number;
};
