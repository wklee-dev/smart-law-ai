export type KitaStrategicMaterialListRow = {
  hs_code: string;
  hs_name_ko: string;
  hs_name_en: string;
  control_no: string;
};

export type KitaStrategicMaterialDetailRow = {
  control_no: string;
  content_ko: string;
  content_en: string;
  source_url: string;
};

export type KitaStrategicMaterialListQuery = {
  page: number;
  pageSize: number;
  keyword?: string;
};
