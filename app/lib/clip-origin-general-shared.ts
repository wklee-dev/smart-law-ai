export type ClipOriginGeneralSectionRow = {
  section_key: string;
  section_name: string;
  display_order: number;
};

export type ClipOriginGeneralSectionDetail = ClipOriginGeneralSectionRow & {
  body_html: string;
  body_text: string;
  source_url: string;
};
