export type ClipAdminNoticeListRow = {
  noticeId: string;
  listNumber: string;
  title: string;
  departmentName: string;
  writtenDate: string;
  nFiles: number;
};

export type ClipAdminNoticeFile = {
  attachmentPk: number;
  fileName: string;
  sizeBytes: number;
  downloadUrl: string;
};

export type ClipAdminNoticeDetail = ClipAdminNoticeListRow & {
  contentHtml: string;
  contentText: string;
  sourceUrl: string;
  publicationYear: string;
  publicationNumber: string;
  detailStatus: string;
  files: ClipAdminNoticeFile[];
};
