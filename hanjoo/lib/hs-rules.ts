import { openSmartLawDb } from "@/hanjoo/lib/smart-law-db";

export type HsRule = {
  no: string;
  kicker: string;
  marked: boolean;
  body: string;
  note: string;
  foot: string;
};

const RULE_NOS = ["1", "2", "3", "4", "5", "6", "7"] as const;

function plain(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitRule(html: string, no: string): HsRule & { intro: string } {
  const text = plain(html);
  let main = text;
  let note = "";
  let foot = "";
  const expl = text.search(/\[해설\]/);
  if (expl >= 0) {
    main = text.slice(0, expl).trim();
    note = text.slice(expl).replace(/^\[해설\]\s*/, "").trim();
  } else {
    const footAt = text.search(/(?:^|\n)각주\s*(?:\n|$)/);
    if (footAt >= 0) {
      main = text.slice(0, footAt).trim();
      foot = text.slice(footAt).replace(/^(?:\n)?각주\s*/, "").trim();
    }
  }
  const heading = new RegExp(`통칙\\s*제\\s*${no}\\s*호\\s*(?:\\(\\*\\))?`);
  const at = main.search(heading);
  const marked = new RegExp(`통칙\\s*제\\s*${no}\\s*호\\s*\\(\\*\\)`).test(main);
  if (at < 0) {
    return { no, kicker: "", marked, body: main, note, foot, intro: "" };
  }
  const before = main.slice(0, at).trim();
  return {
    no,
    intro: no === "1" ? before : "",
    kicker: no === "1" ? "" : before,
    marked,
    body: main.slice(at).replace(heading, "").trim(),
    note,
    foot,
  };
}

export async function listHsRuleYears(): Promise<string[]> {
  const db = await openSmartLawDb();
  try {
    const rows = await db.all(
      `SELECT DISTINCT aply_year
         FROM hs_manual_gnpr
        WHERE lang_code = 'kor'
          AND gnpr_srno IN ('1','2','3','4','5','6','7')
        ORDER BY aply_year DESC`,
    );
    return rows.map((r) => String(r.aply_year));
  } finally {
    await db.close();
  }
}

export async function listHsRules(
  year: string,
): Promise<{ intro: string; rules: HsRule[] }> {
  const db = await openSmartLawDb();
  try {
    const rows = await db.all(
      `SELECT gnpr_srno, content_text
         FROM hs_manual_gnpr
        WHERE lang_code = 'kor' AND aply_year = ?
          AND gnpr_srno IN ('1','2','3','4','5','6','7')`,
      [year],
    );
    const byNo = new Map(
      rows.map((r) => [String(r.gnpr_srno), String(r.content_text ?? "")]),
    );
    const rules = RULE_NOS.filter((no) => byNo.has(no)).map((no) =>
      splitRule(byNo.get(no) ?? "", no),
    );
    return {
      intro: rules.find((r) => r.intro)?.intro ?? "",
      rules: rules.map(({ no, kicker, marked, body, note, foot }) => ({
        no,
        kicker,
        marked,
        body,
        note,
        foot,
      })),
    };
  } finally {
    await db.close();
  }
}
