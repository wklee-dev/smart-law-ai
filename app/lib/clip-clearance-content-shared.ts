/** CLIP 통관정보 · 지식재산권·남북한교역·전략물자 종합정보 */
export const CLIP_CLEARANCE_CONTENT_SLUGS = [
  "intellectual-property",
  "inter-korean-trade",
  "strategic-goods",
] as const;

export type ClipClearanceContentSlug =
  (typeof CLIP_CLEARANCE_CONTENT_SLUGS)[number];

export type ClipClearanceContentDetail = {
  slug: ClipClearanceContentSlug;
  page_title: string;
  body_html: string;
  body_text: string;
  source_url: string;
  retrieved_at: string;
};

export const CLIP_CLEARANCE_CONTENT_TABLE: Record<
  ClipClearanceContentSlug,
  string
> = {
  "intellectual-property": "clip_ipr_content",
  "inter-korean-trade": "clip_nk_trade_content",
  "strategic-goods": "clip_strategic_material_content",
};

export function isClipClearanceContentSlug(
  slug: string,
): slug is ClipClearanceContentSlug {
  return (CLIP_CLEARANCE_CONTENT_SLUGS as readonly string[]).includes(slug);
}
