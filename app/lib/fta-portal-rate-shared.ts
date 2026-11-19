export type PortalFtaNation = {
  nation_code: string;
  nation_name_kr: string;
  nation_name_en: string;
  fta_id: string;
  tab_order: number;
  rate_count: number;
};

export type PortalFtaChapter = {
  chapter_code: string;
  chapter_name_kr: string;
  chapter_name_en: string;
};

export type PortalFtaHsItem = {
  nation_code: string;
  nation_name_kr: string;
  hs_no: string;
  division: string;
  item_name: string;
  base_year: string;
  base_rate: string;
  has_year_link: boolean;
};

export type PortalFtaYearRate = {
  rate_year: string;
  agreement_rate: string;
};

export type PortalFtaGuide = {
  guide_type: string;
  agreement_name: string;
  base_ref: string;
};
