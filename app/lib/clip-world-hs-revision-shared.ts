/** CLIP 세계HS 개정표 — 포털 기본 버전 쌍 */
export const CLIP_WORLD_HS_REVISION_VERSION_PAIRS = [
  { value: "2017-2022", baseYear: 2017, revisedYear: 2022 },
  { value: "2012-2017", baseYear: 2012, revisedYear: 2017 },
  { value: "2007-2012", baseYear: 2007, revisedYear: 2012 },
  { value: "2002-2007", baseYear: 2002, revisedYear: 2007 },
] as const;

export type ClipWorldHsRevisionVersionPair =
  (typeof CLIP_WORLD_HS_REVISION_VERSION_PAIRS)[number]["value"];

export type ClipWorldHsRevisionListRow = {
  id: number;
  before_hs_code: string;
  after_hs_code: string;
  description_en: string;
  description_ko: string;
  base_version_year: number;
  revised_version_year: number;
  version_pair: string;
};

export type ClipWorldHsRevisionQueryParams = {
  page: number;
  pageSize: number;
  versionPair: string;
  hsCode?: string;
  description?: string;
};

export type ClipWorldHsRevisionVersionOption = {
  value: string;
  label: string;
  baseYear: number;
  revisedYear: number;
  count?: number;
};
