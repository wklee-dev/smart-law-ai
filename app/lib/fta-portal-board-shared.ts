export type FtaPortalPostListRow = {
  id: number;
  listNumber: string;
  category: string;
  title: string;
  author: string;
  registeredDate: string;
  viewCount: number;
  nFiles: number;
};

export type FtaPortalFileRow = {
  id: number;
  fileName: string;
  sizeBytes: number;
  downloadUrl: string;
};

export type FtaPortalPostDetail = FtaPortalPostListRow & {
  contentHtml: string;
  contentText: string;
  sourceUrl: string;
  crawledAt: string;
  files: FtaPortalFileRow[];
};
