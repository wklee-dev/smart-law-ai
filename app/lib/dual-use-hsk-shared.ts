export type DualUseHskListRow = {
  hsk_cd: string;
  hsk_nm: string;
  hsk_eng_nm: string;
  cntrl_no: string;
  cntrl_no_lvl: number | null;
  up_cntrl_no: string;
  cntrl_stts_cd: string;
};

export type DualUseHskDetailRow = {
  cntrl_no: string;
  up_cntrl_no: string;
  ko_expl: string;
  en_expl: string;
  hsk_cd: string;
  hsk_nm: string;
  hsk_eng_nm: string;
  src_url: string;
};

export type DualUseHskListQuery = {
  page: number;
  pageSize: number;
  keyword?: string;
};
