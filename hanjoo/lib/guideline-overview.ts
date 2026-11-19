import { withSmartLawDb } from "@/hanjoo/lib/smart-law-db";

export type GuidelineSection = {
  title: string;
  html: string;
  text: string;
};

function cleanHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
}

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

export async function getGuidelineOverview(
  code: string,
): Promise<{ title: string; sections: GuidelineSection[] } | null> {
  return withSmartLawDb(async (db) => {
    if (code === "imex" || code === "approval-exemption") {
      const row = await db.get(
        `SELECT s.content_html AS html, s.content_text AS text
           FROM imex_notice_summary s
           JOIN imex_notice_master m ON m.notice_key = s.notice_key
          ORDER BY m.notice_date DESC, m.notice_no DESC
          LIMIT 1`,
      );
      if (!row) {
        return {
          title: code === "imex" ? "수출입공고" : "수출입승인의 면제",
          sections: [],
        };
      }
      if (code === "imex") {
        return {
          title: "수출입공고",
          sections: [{ title: "", html: cleanHtml(row.html), text: cleanText(row.text) }],
        };
      }
      const text = cleanText(row.text);
      const start = text.indexOf("수출입승인 면제");
      const endCandidates = ["출입제한·금지품목", "통합공고와의 관계"]
        .map((label) => text.indexOf(label, Math.max(0, start + 1)))
        .filter((index) => index > start);
      const end = endCandidates.length ? Math.min(...endCandidates) : text.length;
      return {
        title: "수출입승인의 면제",
        sections: [
          {
            title: "수출입승인 면제",
            html: "",
            text: start >= 0 ? text.slice(start, end).trim() : "DB 내 해당 설명 본문이 없습니다.",
          },
        ],
      };
    }

    if (code === "integrated") {
      const row = await db.get(
        `SELECT title, raw_html AS html, body_text AS text
           FROM clip_integrated_notice_general_info
          ORDER BY general_info_id DESC LIMIT 1`,
      );
      return {
        title: "통합공고",
        sections: row
          ? [{ title: cleanText(row.title), html: cleanHtml(row.html), text: cleanText(row.text) }]
          : [],
      };
    }

    if (code === "customs-chief") {
      const rows = await db.all(
        `SELECT section_title AS title, body_html AS html, body_text AS text
           FROM clip_cc_integrated_info
          ORDER BY section_order, integrated_info_id`,
      );
      return {
        title: "세관장확인",
        sections: rows.map((row) => ({
          title: cleanText(row.title),
          html: cleanHtml(row.html),
          text: cleanText(row.text),
        })),
      };
    }
    return null;
  });
}
