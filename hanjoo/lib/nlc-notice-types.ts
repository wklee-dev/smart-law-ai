export type NlcNoticeSort =
  | "date_desc"
  | "date_asc"
  | "title_asc"
  | "views_desc";

export type NlcNoticeStatusFilter = "all" | "open" | "closed";

/** 국민참여입법센터 — 통합입법예고 조회 화면 종류 */
export type NlcNoticeKind =
  | "ministry-legislation"
  | "ministry-administrative"
  | "local-legislation";

export type NlcNoticeAttachmentRow = {
  attachmentId: number;
  fileName: string;
  downloadUrl: string;
  hasLocalFile: boolean;
  fileSize: number | null;
};

export type NlcMinistryLegislationListItem = {
  noticeSequence: string;
  title: string;
  department: string;
  lawType: string;
  lawField: string;
  targetAudience: string;
  startDate: string;
  endDate: string;
  viewCount: number | null;
  sourceUrl: string;
};

export type NlcMinistryAdministrativeListItem = {
  noticeSequence: string;
  title: string;
  ruleType: string;
  institution: string;
  noticeNumber: string;
  startDate: string;
  endDate: string;
  viewCount: number | null;
  sourceUrl: string;
};

export type NlcLocalLegislationListItem = {
  noticeSequence: string;
  title: string;
  localGovernment: string;
  noticeNumber: string;
  announcementDate: string;
  viewCount: number | null;
  sourceUrl: string;
};

export type NlcNoticeDetail = {
  kind: NlcNoticeKind;
  noticeSequence: string;
  title: string;
  sourceUrl: string;
  viewCount: number | null;
  bodyText: string;
  detailInfo: Record<string, string>;
  attachments: NlcNoticeAttachmentRow[];
  /** ministry-legislation */
  department?: string;
  lawType?: string;
  lawField?: string;
  targetAudience?: string;
  startDate?: string;
  endDate?: string;
  /** ministry-administrative */
  ruleType?: string;
  institution?: string;
  noticeNumber?: string;
  phone?: string;
  fax?: string;
  email?: string;
  /** local */
  localGovernment?: string;
  announcementDate?: string;
};

export type NlcListResponse =
  | {
      ok: true;
      kind: "ministry-legislation";
      dataAvailable: true;
      total: number;
      page: number;
      pageSize: number;
      items: NlcMinistryLegislationListItem[];
      facets: {
        departments: string[];
        lawTypes: string[];
        lawFields: string[];
      };
    }
  | {
      ok: true;
      kind: "ministry-administrative";
      dataAvailable: true;
      total: number;
      page: number;
      pageSize: number;
      items: NlcMinistryAdministrativeListItem[];
      facets: {
        institutions: string[];
        ruleTypes: string[];
      };
    }
  | {
      ok: true;
      kind: "local-legislation";
      dataAvailable: boolean;
      message?: string;
      total: number;
      page: number;
      pageSize: number;
      items: NlcLocalLegislationListItem[];
      facets?: {
        localGovernments: string[];
        localRegions: string[];
      };
    };

export const NLC_NOTICE_TABS: {
  kind: NlcNoticeKind;
  href: string;
  label: string;
  originalUrl: string;
}[] = [
  {
    kind: "ministry-legislation",
    href: "/laws/legislation-notice?kind=ministry-legislation",
    label: "(부처)입법예고",
    originalUrl:
      "https://opinion.lawmaking.go.kr/gcom/tlaw/ogLmPp/list?menuId=15",
  },
  {
    kind: "ministry-administrative",
    href: "/laws/legislation-notice?kind=ministry-administrative",
    label: "(부처)행정예고",
    originalUrl:
      "https://opinion.lawmaking.go.kr/gcom/tlaw/ogAdPp/list?menuId=16",
  },
  {
    kind: "local-legislation",
    href: "/laws/legislation-notice?kind=local-legislation",
    label: "(지방)입법예고",
    originalUrl:
      "https://opinion.lawmaking.go.kr/gcom/tlaw/ogLocPp/list?menuId=17",
  },
];

export function nlcNoticePageTitle(kind: NlcNoticeKind): string {
  return NLC_NOTICE_TABS.find((t) => t.kind === kind)?.label ?? "통합입법예고";
}
