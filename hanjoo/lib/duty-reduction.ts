import data from "@/hanjoo/lib/data/duty-reduction-ciel.json";

type DutySource = { name: string; url: string; db: "있음" | "없음" | "참고"; detail: string };
type DutyRow = Record<string, string>;
type DutySection = {
  title: string;
  lines: string[];
  table?: { columns: string[]; rows: string[][] };
  afterLines?: string[];
};

type KindLink = { href: string; label: string; related: { href: string; label: string }[] };
type PageNote = {
  title: string;
  lines: string[];
  table?: { columns: string[]; rows: string[][] };
};

type PageData = {
  code: string;
  title: string;
  article: number | null;
  intro: string[];
  tables: { columns: string[]; rows: string[][] }[];
  notes?: PageNote[];
  missing?: boolean;
  kinds?: KindLink[];
};

const CIEL = "https://www.clhs.co.kr";
const pages = data.pages as Record<string, PageData>;

/** App route code → JSON page key */
export const REDUCTION_MENUS: {
  code: string;
  pageKey: string;
  title: string;
  parent?: string;
}[] = [
  { code: "reduction", pageKey: "kinds", title: "관세감면의 종류" },
  { code: "reduction-88", pageKey: "r88", title: "제88조 외교관용물품 등의 면세" },
  { code: "reduction-89", pageKey: "r89", title: "제89조 세율불균형물품의 면세" },
  { code: "reduction-90", pageKey: "r90", title: "제90조 학술연구용품의 감면" },
  {
    code: "reduction-90-rind",
    pageKey: "r90-rind",
    title: "산업기술 연구개발용 물품에 관한 관세감면",
    parent: "reduction-90",
  },
  { code: "reduction-91", pageKey: "r91", title: "제91조 종교용품·자선용품·장애인용품 등의 면세" },
  {
    code: "reduction-91-jei",
    pageKey: "r91-jei",
    title: "장애인용 물품 등의 관세감면",
    parent: "reduction-91",
  },
  { code: "reduction-92", pageKey: "r92", title: "제92조 정부용품 등의 면세" },
  { code: "reduction-93", pageKey: "r93", title: "제93조 특정물품의 면세" },
  { code: "reduction-94", pageKey: "r94", title: "제94조 소액물품 등의 면세" },
  {
    code: "reduction-94-self",
    pageKey: "r94-self",
    title: "자가사용 인정기준",
    parent: "reduction-94",
  },
  { code: "reduction-95", pageKey: "r95", title: "제95조 환경오염방지물품 등에 대한 감면" },
  {
    code: "reduction-95-rplt",
    pageKey: "r95-rplt",
    title: "공장자동화물품에 대한 관세감면",
    parent: "reduction-95",
  },
  { code: "installment", pageKey: "r-rdvd", title: "분할납부" },
  { code: "reduction-96", pageKey: "r96", title: "제96조 여행자휴대품·이사물품 등의 감면" },
  {
    code: "reduction-96-move",
    pageKey: "r96-move",
    title: "이사물품의 수입통관",
    parent: "reduction-96",
  },
  { code: "reduction-97", pageKey: "r97", title: "제97조 재수출면세" },
  { code: "reduction-98", pageKey: "r98", title: "제98조 재수출감면" },
  { code: "reduction-99", pageKey: "r99", title: "제99조 재수입면세" },
  { code: "reduction-100", pageKey: "r100", title: "제100조 손상물품에 대한 감면" },
  { code: "reduction-101", pageKey: "r101", title: "제101조 해외임가공물품 등의 감면" },
  { code: "reduction-tax", pageKey: "r-tax", title: "조세특례제한법에 따른 감면" },
  { code: "reduction-fta", pageKey: "r-fta", title: "FTA특례법에 따른 관세감면" },
  { code: "reduction-treaty", pageKey: "r-int", title: "조약·협정에 따른 관세감면" },
];

const HREF_TO_CODE: Record<string, string> = {
  "Rduty.asp?table=88": "reduction-88",
  "Rduty.asp?table=89": "reduction-89",
  "Rduty.asp?table=90": "reduction-90",
  "rmofe.asp?rduty=rind": "reduction-90-rind",
  "Rduty.asp?table=91": "reduction-91",
  "Rjei.asp": "reduction-91-jei",
  "Rduty.asp?table=92": "reduction-92",
  "Rduty.asp?table=93": "reduction-93",
  "Rduty.asp?table=94": "reduction-94",
  "Rduty94.asp": "reduction-94-self",
  "Rduty.asp?table=95": "reduction-95",
  "rmofe.asp?rduty=rplt": "reduction-95-rplt",
  "rmofe.asp?rduty=rdvd": "installment",
  "Rduty.asp?table=96": "reduction-96",
  "Rduty96B.asp": "reduction-96-move",
  "Rduty.asp?table=97": "reduction-97",
  "Rduty.asp?table=98": "reduction-98",
  "Rduty.asp?table=99": "reduction-99",
  "Rduty.asp?table=100": "reduction-100",
  "Rduty.asp?table=101": "reduction-101",
  "Rduty.asp?table=118": "reduction-tax",
  "Rduty_fta.asp": "reduction-fta",
  "Rduty_int.asp": "reduction-treaty",
};

export function isReductionCode(code: string): boolean {
  return REDUCTION_MENUS.some((m) => m.code === code);
}

const INSTALLMENT_PAGE_SIZE = 5;

function digitsOnly(value: string): string {
  return String(value ?? "").replace(/\D/g, "");
}

/** HS cell may list several codes ("3917-23, 39, 40" / "6815-10… / 6902-…"). */
function hsCellMatches(cell: string, queryDigits: string): boolean {
  if (!queryDigits) return true;
  const raw = String(cell ?? "");
  const compact = digitsOnly(raw);
  if (compact.includes(queryDigits)) return true;
  // also match per token so "7304" hits "7304-10, 21, 29"
  const tokens = raw.split(/[\/,;·\s]+/).map((t) => digitsOnly(t)).filter(Boolean);
  return tokens.some((t) => t.startsWith(queryDigits) || queryDigits.startsWith(t) || t.includes(queryDigits));
}

export function getReductionView(
  code: string,
  pageRaw = 1,
  hsRaw = "",
): {
  title: string;
  sources: DutySource[];
  columns: string[];
  rows: DutyRow[];
  total: number;
  page: number;
  pageSize: number;
  lawText: string;
  kinds: [];
  notes: [];
  flexIntro: string;
  sections: DutySection[];
  tailSections?: DutySection[];
  reductionLinks?: { law: string; name: string; href: string; related: { name: string; href: string }[] }[];
  hsQuery?: string;
  searchHs?: boolean;
} | null {
  const menu = REDUCTION_MENUS.find((m) => m.code === code);
  if (!menu) return null;
  const page = pages[menu.pageKey];
  if (!page) return null;

  const sections: DutySection[] = [];
  if (page.intro.length) {
    sections.push({
      title: menu.pageKey === "kinds" ? "안내" : "1. 개요",
      lines: page.intro,
    });
  }

  const columns: string[] = [];
  let rows: DutyRow[] = [];
  const usable = page.tables
    .map((table, index) => ({
      index,
      columns: table.columns.map((c, i) => c || `열${i + 1}`),
      rows: table.rows.filter((r) => r.some((c) => String(c ?? "").trim())),
    }))
    .filter((t) => t.rows.length > 0 && t.columns.length >= 2 && t.columns[0].length < 40);

  const primary =
    usable.find((t) => ["감면물품", "연번", "종류", "HS", "지역", "구분"].includes(t.columns[0])) ??
    usable.sort((a, b) => b.rows.length - a.rows.length)[0];

  if (primary) {
    columns.push(...primary.columns);
    for (const row of primary.rows) {
      // drop pager junk rows
      const joined = row.join(" ");
      if (/\[\d+\]/.test(joined) && joined.includes("▶")) continue;
      const item: DutyRow = {};
      primary.columns.forEach((col, i) => {
        item[col] = row[i] ?? "";
      });
      rows.push(item);
    }
  }

  page.tables.forEach((table, index) => {
    if (primary && index === primary.index) return;
    const cols = table.columns.map((c, i) => c || `열${i + 1}`);
    if (!table.rows.length || cols[0].length >= 40) return;
    sections.push({
      title: `참고표 ${index + 1}`,
      lines: [],
      table: { columns: cols, rows: table.rows },
    });
  });

  const tailSections: DutySection[] = [];
  if (page.notes?.length) {
    for (const note of page.notes) {
      tailSections.push({
        title: note.title,
        lines: note.lines,
        table: note.table,
      });
    }
  }

  const reductionLinks =
    menu.pageKey === "kinds" && page.kinds
      ? page.kinds.map((k) => ({
          law: "관세법",
          name: k.label,
          href: `/rates/duty/${HREF_TO_CODE[k.href] ?? "reduction"}`,
          related: k.related.map((r) => ({
            name: r.label,
            href: `/rates/duty/${HREF_TO_CODE[r.href] ?? "reduction"}`,
          })),
        }))
      : undefined;

  // tax / fta law labels
  if (reductionLinks) {
    for (const link of reductionLinks) {
      if (link.name.includes("조세특례")) link.law = "조세특례제한법";
      else if (link.name.includes("자유무역협정") || link.name.includes("FTA")) link.law = "FTA특례법";
      else if (link.name.includes("조약")) link.law = "조약·협정";
    }
  }

  const hsQuery = digitsOnly(hsRaw);
  const hasHsColumn = columns.includes("HS");
  const searchHs = code === "installment" && hasHsColumn;
  const pageSize = searchHs ? INSTALLMENT_PAGE_SIZE : Math.max(rows.length, 1);

  if (searchHs && hsQuery) {
    rows = rows.filter((row) => hsCellMatches(String(row.HS ?? ""), hsQuery));
  }

  const total = rows.length;
  let pageNum = 1;
  if (searchHs) {
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    pageNum = Math.min(Math.max(1, pageRaw || 1), pageCount);
    const offset = (pageNum - 1) * pageSize;
    rows = rows.slice(offset, offset + pageSize);
  }

  const sources: DutySource[] = [
    { name: "CIEL 화면", url: CIEL, db: "참고", detail: "Y2018/duty Rduty·관련 화면 구성 참고" },
    {
      name: "자료",
      url: CIEL,
      db: total || page.intro.length ? "있음" : "참고",
      detail: `CIEL 관세감면 ${menu.title}. 품목표 ${total}행${searchHs ? ` · ${pageSize}건/페이지` : ""}`,
    },
  ];

  return {
    title: menu.title,
    sources,
    columns,
    rows,
    total,
    page: pageNum,
    pageSize,
    lawText: "",
    kinds: [],
    notes: [],
    flexIntro: "",
    sections,
    tailSections: tailSections.length ? tailSections : undefined,
    reductionLinks,
    hsQuery: searchHs ? hsQuery : undefined,
    searchHs: searchHs || undefined,
  };
}
