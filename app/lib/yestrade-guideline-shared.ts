export type YtgPageListRow = {
  page_id: number;
  seq: number;
  menu_lv1: string;
  menu_lv2: string;
  page_name: string;
  page_title: string;
  source_url: string;
  breadcrumb: string;
  n_sections: number;
  n_items: number;
  n_tables: number;
  n_images: number;
  n_attachments: number;
  n_links: number;
  crawled_at: string;
};

export type YtgAttachmentRow = {
  attach_id: number;
  seq: number;
  label: string;
  button_text: string;
  file_name: string;
  file_size: number;
  downloaded: number;
  downloadUrl: string;
};

export type YtgImageRow = {
  image_id: number;
  seq: number;
  alt: string;
  file_name: string;
  url: string;
  downloaded: number;
  srcUrl: string;
};

export type YtgLinkRow = {
  link_id: number;
  seq: number;
  label: string;
  url: string;
  domain: string;
  context: string;
};

export type YtgPageDetail = YtgPageListRow & {
  page_text: string;
  content_xhtml: string;
  attachments: YtgAttachmentRow[];
  images: YtgImageRow[];
  links: YtgLinkRow[];
};
