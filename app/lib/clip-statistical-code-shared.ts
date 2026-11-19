export type ClipStatisticalCodeCategoryRow = {
  stat_code: string;
  stat_sign: string;
  stat_name: string;
  source_seq: number;
};

export type ClipStatisticalCodeDetailRow = {
  detail_code: string;
  name_kr: string;
  abbr_kr: string;
  abbr_en: string;
  name_en: string;
};

export type ClipStatisticalCodeCategoryQueryParams = {
  page: number;
  pageSize: number;
  keyword?: string;
};

export type ClipStatisticalCodeDetailQueryParams = {
  statCode: string;
  page: number;
  pageSize: number;
  keyword?: string;
};
