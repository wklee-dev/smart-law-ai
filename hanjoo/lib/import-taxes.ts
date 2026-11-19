import { withSmartLawDb } from "@/hanjoo/lib/smart-law-db";

export type ImportTaxCitation = {
  id: number;
  lawName: string;
  heading: string;
  title: string;
  enforce: string;
  text: string;
  sourceTable: "law_articles";
  sourceId: string;
};

export type ImportTaxRow = {
  code: string;
  name: string;
  lawName: string;
  summary: string;
  citations: ImportTaxCitation[];
};

type Item = { level: string; no: string; text: string };
type Article = {
  id: number;
  title: string;
  content: string;
  items: Item[];
  enforce: string;
  lawName: string;
};

type Spec = {
  code: string;
  name: string;
  lawId: string;
  titles: string[];
  summary: (pick: (title: string) => Article | null) => string;
};

const SPECS: Spec[] = [
  {
    code: "customs",
    name: "관세",
    lawId: "001556",
    titles: ["과세표준", "납세의무자", "세율의 종류", "세율 적용의 우선순위"],
    summary(pick) {
      const lines: string[] = [];
      const base = pick("과세표준");
      const payer = pick("납세의무자");
      const kinds = pick("세율의 종류");
      lines.push(base ? `과세표준: ${sentence(body(base))}` : "과세표준: DB 내 근거자료 없음");
      if (payer) lines.push(`납세의무자: ${sentence(body(payer))}`);
      lines.push("세율: 물품별 세율 상이");
      if (kinds) {
        lines.push(sentence(kinds.content));
        const kindsText = kinds.items
          .map((item) => item.text)
          .filter(Boolean)
          .join("\n");
        if (kindsText) lines.push(kindsText);
      } else {
        lines.push("세율 종류: DB 내 근거자료 없음");
      }
      lines.push("HS코드별 수치는 이 조문에 없다. 별도 확인 필요");
      return lines.join("\n");
    },
  },
  {
    code: "fta",
    name: "FTA",
    lawId: "010097",
    titles: [
      "협정관세의 적용요건",
      "원산지결정기준",
      "협정관세의 적용신청 등",
      "협정관세 사후적용의 신청",
      "원산지증명서 작성ㆍ발급 등",
    ],
    summary(pick) {
      const req = pick("협정관세의 적용요건");
      const lines = ["적용요건:"];
      if (req) lines.push(body(req));
      else lines.push("DB 내 근거자료 없음");
      lines.push("세율: 협정별·품목별 세율은 이 법률 조문에 없다. 별도 확인 필요");
      return lines.join("\n");
    },
  },
  {
    code: "individual",
    name: "개별소비세",
    lawId: "001570",
    titles: ["과세대상과 세율", "납세의무자", "과세표준", "수출 및 군납 면세", "외교관 면세", "조건부면세", "무조건 면세"],
    summary(pick) {
      const target = pick("과세대상과 세율");
      const std = pick("과세표준");
      const lines: string[] = [];
      const hang = target?.items.find((item) => item.text)?.text ?? "";
      lines.push(hang ? `과세대상: ${sentence(hang)}` : "과세대상: DB 내 근거자료 없음");
      lines.push(std ? `과세표준: ${sentence(body(std))}` : "과세표준: DB 내 근거자료 없음");
      lines.push("세율: 물품별 세율 상이. 수치는 과세대상과 세율 조문의 각 호에 있다.");
      return lines.join("\n");
    },
  },
  {
    code: "liquor",
    name: "주세",
    lawId: "001566",
    titles: ["세율", "과세대상", "과세표준", "수입 주류에 대한 과세"],
    summary(pick) {
      const target = pick("과세대상");
      const std = pick("과세표준");
      const rate = pick("세율");
      const imported = pick("수입 주류에 대한 과세");
      const lines: string[] = [];
      lines.push(target ? `과세대상: ${sentence(body(target))}` : "과세대상: DB 내 근거자료 없음");
      lines.push(imported ? `수입 주류: ${sentence(body(imported))}` : "수입 주류: DB 내 근거자료 없음");
      lines.push(std ? `과세표준: ${sentence(body(std))}` : "과세표준: DB 내 근거자료 없음");
      if (rate) {
        const detail = rate.items
          .map((item) => item.text)
          .filter(Boolean)
          .join("\n");
        lines.push(detail ? `세율:\n${detail}` : "세율: DB 내 근거자료 없음");
      } else {
        lines.push("세율: DB 내 근거자료 없음");
      }
      return lines.join("\n");
    },
  },
  {
    code: "education",
    name: "교육세",
    lawId: "001729",
    titles: ["과세표준과 세율", "납세의무자"],
    summary(pick) {
      const rate = pick("과세표준과 세율");
      const payer = pick("납세의무자");
      const lines: string[] = [];
      if (payer) lines.push(`납세의무자: ${sentence(body(payer))}`);
      const hangs = rate?.items.filter((item) => item.text) ?? [];
      const lead = hangs.find((item) => item.text.startsWith("①")) ?? hangs[0];
      lines.push(lead ? `과세표준·세율: ${sentence(lead.text)}` : "과세표준·세율: DB 내 근거자료 없음");
      const imported = lead ? educationImportLines(lead.text) : [];
      if (imported.length) lines.push(imported.join("\n"));
      else lines.push("수입 관련 세율: 법령 확인 필요");
      const adjust = hangs.find((item) => item.text.startsWith("②"));
      if (adjust) lines.push(`세율 조정 한도: ${sentence(adjust.text)}`);
      return lines.join("\n");
    },
  },
  {
    code: "transport",
    name: "교통세",
    lawId: "000623",
    titles: ["과세대상과 세율", "납세의무자", "과세표준", "수출 및 군납면세"],
    summary(pick) {
      const rate = pick("과세대상과 세율");
      const std = pick("과세표준");
      const lines: string[] = [];
      const items = rate?.items.filter((item) => item.text) ?? [];
      const statutory = items.filter((item) => /^[0-9]+\./.test(item.text));
      const flexible = items.find((item) => item.text.startsWith("③"));
      lines.push(statutory.length ? `법정세율:\n${statutory.map((item) => item.text).join("\n")}` : "법정세율: DB 내 근거자료 없음");
      lines.push(flexible ? `탄력세율: ${flexible.text}` : "탄력세율: 법령 확인 필요");
      if (std) lines.push(`과세표준: ${sentence(body(std))}`);
      return lines.join("\n");
    },
  },
  {
    code: "rural",
    name: "농특세",
    lawId: "001569",
    titles: ["과세표준과 세율", "납세의무자"],
    summary(pick) {
      const rate = pick("과세표준과 세율");
      const payer = pick("납세의무자");
      const lines: string[] = [];
      if (payer) lines.push(`납세의무자: ${sentence(body(payer))}`);
      const items = rate?.items.filter((item) => item.text) ?? [];
      const lead = items.find((item) => item.text.startsWith("①"));
      lines.push(lead ? `과세표준·세율: ${sentence(lead.text)}` : "과세표준·세율: DB 내 근거자료 없음");
      const customs = lead ? ruralCustomsLine(lead.text) : null;
      lines.push(customs ?? "수입물품에 한정한 호는 이 조문에서 분리되지 않았다. 법령 확인 필요");
      lines.push("그 밖 호는 세율이 다르다.");
      return lines.join("\n");
    },
  },
  {
    code: "vat",
    name: "부가가치세",
    lawId: "001571",
    titles: ["재화의 수입", "과세표준", "세율", "재화의 수입에 대한 면세"],
    summary(pick) {
      const goods = pick("재화의 수입");
      const std = pick("과세표준");
      const rate = pick("세율");
      const exempt = pick("재화의 수입에 대한 면세");
      const lines: string[] = [];
      lines.push(goods ? `과세대상: ${sentence(body(goods))}` : "과세대상: DB 내 근거자료 없음");
      const stdBits = std ? [std.content, ...std.items.map((item) => item.text)].filter((text) => text.includes("수입")) : [];
      lines.push(stdBits.length ? `과세표준: ${stdBits.map((text) => sentence(text)).join("\n")}` : "과세표준: 수입재화 해당 문장을 이 조문에서 확인하지 못했다. 법령 확인 필요");
      lines.push(rate ? `세율: ${sentence(body(rate))}` : "세율: DB 내 근거자료 없음");
      if (exempt) {
        const hos = exempt.items
          .map((item) => item.text)
          .filter(Boolean)
          .join("\n");
        lines.push(hos ? `면세:\n${sentence(exempt.content)}\n${hos}` : `면세: ${sentence(body(exempt))}`);
      }
      return lines.join("\n");
    },
  },
  {
    code: "local",
    name: "지방세",
    lawId: "001649",
    titles: ["특별징수의무자", "담배의 반출신고", "제조장 또는 보세구역에서의 반출로 보는 경우"],
    summary(pick) {
      const withhold = pick("특별징수의무자");
      const tobacco = pick("담배의 반출신고");
      const deemed = pick("제조장 또는 보세구역에서의 반출로 보는 경우");
      const lines = [
        "수입물품 일반에 대한 과세 조문은 확인되지 않았다.",
        withhold ? `지방소비세: ${sentence(body(withhold))}` : "지방소비세: DB 내 근거자료 없음",
      ];
      if (tobacco) lines.push(`담배소비세: ${sentence(body(tobacco))}`);
      if (deemed) lines.push(sentence(body(deemed)));
      lines.push("세율: 별도 확인 필요");
      return lines.join("\n");
    },
  },
];

function flattenLaw(text: string): string {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/[│├┼┤└┘┌┐─┬┴]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function educationImportLines(text: string): string[] {
  const flat = flattenLaw(text);
  const lines: string[] = [];
  if (
    flat.includes("「개별소비세법」에 따라 납부하여야 할") &&
    flat.includes("100분의 30") &&
    flat.includes("100분의 15")
  ) {
    lines.push(
      "개별소비세액: 100분의 30. 다만, 「개별소비세법」 제1조제2항제4호다목ㆍ라목ㆍ바목 및 아목의 물품은 100분의 15.",
    );
  }
  if (flat.includes("납부하여야 할 교통") && flat.includes("100분의 15")) {
    lines.push("교통ㆍ에너지ㆍ환경세액: 100분의 15.");
  }
  if (flat.includes("「주세법」에 따라 납부하여야 할 주세액") && flat.includes("100분의 10") && flat.includes("100분의 30")) {
    lines.push("주세액: 100분의 10. 다만, 맥주 등 해당 각 목의 주류는 100분의 30.");
  }
  return lines;
}

function ruralCustomsLine(text: string): string | null {
  const flat = flattenLaw(text);
  if (!flat.includes("「관세법」") || !flat.includes("감면세액") || !flat.includes("100분의 20")) return null;
  return "제1호: 「관세법」 등에 따라 감면을 받는 관세의 감면세액이 과세표준에 포함되고, 그 호에 적힌 세율은 100분의 20이다. 같은 호는 소득세ㆍ법인세ㆍ취득세ㆍ등록면허세 감면에도 적용된다.";
}

function sentence(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const at = clean.indexOf("다.");
  if (at >= 12) return clean.slice(0, at + 2);
  return clean;
}

function body(article: Article): string {
  const items = article.items
    .map((item) => item.text)
    .filter(Boolean)
    .join(" ");
  return [article.content, items].filter(Boolean).join(" ");
}

function headingOf(content: string, title: string, articleNo: string): string {
  const head = content.match(/^제\d+조(?:의\d+)?/);
  if (head) return title ? `${head[0]}(${title})` : head[0];
  if (/^\d{1,4}$/.test(articleNo)) return title ? `제${articleNo}조(${title})` : `제${articleNo}조`;
  return title || "조문";
}

function textOf(article: Article): string {
  const items = article.items
    .map((item) => item.text)
    .filter(Boolean);
  return [article.content.trim(), ...items].filter(Boolean).join("\n");
}

function todayLocal(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function asOfKey(raw: string): string {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return todayLocal();
}

export async function listImportTaxes(query: { asOf?: string; tax?: string; law?: string }): Promise<{
  asOf: string;
  rows: ImportTaxRow[];
}> {
  const asOf = asOfKey(query.asOf ?? "");
  const tax = (query.tax ?? "").trim();
  const law = (query.law ?? "").trim();
  return withSmartLawDb(async (db) => {
    const rows: ImportTaxRow[] = [];
    for (const spec of SPECS) {
      const version = await db.get(
        `SELECT v.id AS id, l.law_name_kr AS lawName, v.enforcement_date AS enforce
           FROM laws l
           JOIN law_versions v ON v.law_id = l.id
          WHERE l.law_id = ?
            AND replace(COALESCE(v.enforcement_date, ''), '-', '') <= replace(?, '-', '')
          ORDER BY v.enforcement_date DESC
          LIMIT 1`,
        [spec.lawId, asOf],
      );
      if (!version?.id || !version.lawName) {
        rows.push({
          code: spec.code,
          name: spec.name,
          lawName: "",
          summary: "해당 기준일에 시행 중인 법령 버전이 DB에 없습니다.",
          citations: [],
        });
        continue;
      }
      const found = new Map<string, Article>();
      for (const title of spec.titles) {
        const row = await db.get(
          `SELECT id, article_no AS articleNo, article_title AS title, article_content AS content
             FROM law_articles
            WHERE law_version_id = ? AND article_type = '조문' AND article_title = ?
            ORDER BY display_order, id
            LIMIT 1`,
          [version.id, title],
        );
        if (!row?.id) continue;
        const items = await db.all(
          `SELECT item_level AS level, item_no AS no, item_content AS text
             FROM law_article_items
            WHERE law_article_id = ?
            ORDER BY display_order, id`,
          [row.id],
        );
        found.set(title, {
          id: Number(row.id),
          title: String(row.title ?? title),
          content: String(row.content ?? ""),
          enforce: String(version.enforce ?? ""),
          lawName: String(version.lawName),
          items: items.map((item) => ({
            level: String(item.level ?? ""),
            no: String(item.no ?? ""),
            text: String(item.text ?? "").trim(),
          })),
        });
      }
      const citations: ImportTaxCitation[] = [...found.values()].map((article) => ({
        id: article.id,
        lawName: article.lawName,
        heading: headingOf(article.content, article.title, ""),
        title: article.title,
        enforce: article.enforce,
        text: textOf(article),
        sourceTable: "law_articles",
        sourceId: String(article.id),
      }));
      rows.push({
        code: spec.code,
        name: spec.name,
        lawName: String(version.lawName),
        summary: spec.summary((title) => found.get(title) ?? null),
        citations,
      });
    }
    return {
      asOf,
      rows: rows.filter((row) => {
        if (tax && !row.name.includes(tax)) return false;
        if (law && !row.lawName.includes(law) && !row.citations.some((item) => item.lawName.includes(law))) return false;
        return true;
      }),
    };
  });
}
