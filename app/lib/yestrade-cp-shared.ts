export type YcpPageSummary = {
  page_id: number;
  page_name: string;
  page_title: string;
  source_url: string;
  breadcrumb: string;
  n_attachments: number;
  n_images: number;
  crawled_at: string;
};

export type YcpAttachmentRow = {
  attach_id: number;
  seq: number;
  label: string;
  button_text: string;
  file_name: string;
  file_size: number;
  downloaded: number;
  downloadUrl: string;
};

export type YcpImageRow = {
  image_id: number;
  seq: number;
  alt: string;
  file_name: string;
  url: string;
  downloaded: number;
  srcUrl: string;
};

export type YcpIntroDetail = YcpPageSummary & {
  page_text: string;
  content_xhtml: string;
  attachments: YcpAttachmentRow[];
  images: YcpImageRow[];
};

export type YcpPostListRow = {
  post_id: number;
  seq: number;
  list_no: string;
  title: string;
  posted_date: string;
  views: string;
  n_files: number;
  attach_summary: string;
  crawled_at: string;
};

export type YcpPostFileRow = {
  file_pk: number;
  seq: number;
  file_label: string;
  file_name: string;
  file_size: number;
  dup_count: number;
  downloaded: number;
  downloadUrl: string;
};

export type YcpPostDetail = YcpPostListRow & {
  source_url: string;
  breadcrumb: string;
  content_text: string;
  content_xhtml: string;
  files: YcpPostFileRow[];
};
