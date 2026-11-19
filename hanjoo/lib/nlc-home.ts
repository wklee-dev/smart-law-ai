import { formatNlcDisplayDate } from "@/hanjoo/lib/nlc-notice-format";
import { listNlcMinistryLegislationNotices } from "@/hanjoo/lib/nlc-notice-server";

export type NlcHomeRow = {
  noticeSequence: string;
  title: string;
  department: string;
  startDateLabel: string;
};

/** 홈 하단 카드용 — (부처)입법예고 최근건 */
export async function listHomeNlcNotices(limit = 5): Promise<NlcHomeRow[]> {
  const res = await listNlcMinistryLegislationNotices({
    page: 1,
    pageSize: limit,
    sort: "date_desc",
    includeFinished: true,
    noticeStatus: "all",
  });
  return res.items.map((row) => ({
    noticeSequence: row.noticeSequence,
    title: row.title,
    department: row.department,
    startDateLabel: formatNlcDisplayDate(row.startDate),
  }));
}
