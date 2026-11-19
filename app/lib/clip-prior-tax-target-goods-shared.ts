/** CLIP 대상물품현황 — 농수산물(09)·개별소비세품목(10) */
export const CLIP_PRIOR_TAX_TARGET_GOODS_GROUP_DEFS = [
  { target_group_code: "09", target_group_name: "농수산물" },
  { target_group_code: "10", target_group_name: "개별소비세품목" },
] as const;

export type ClipPriorTaxTargetGoodsRow = {
  hs_code: string;
  hs_code_display: string;
  item_name: string;
  applicable_start_date: string;
};

export type ClipPriorTaxTargetGoodsGroup = {
  target_group_code: string;
  target_group_name: string;
  items: ClipPriorTaxTargetGoodsRow[];
};

export type ClipPriorTaxTargetGoodsQueryResult = {
  base_date: string;
  groups: ClipPriorTaxTargetGoodsGroup[];
  total: number;
};
