import { openSmartLawDb, withSmartLawDb, type SmartLawDb } from "@/hanjoo/lib/smart-law-db";
import { getReductionView, isReductionCode } from "@/hanjoo/lib/duty-reduction";
import domesticCiel from "@/hanjoo/lib/data/domestic-ciel.json";
import domesticTaxesCiel from "@/hanjoo/lib/data/domestic-taxes-ciel.json";
import provisionalCiel from "@/hanjoo/lib/data/provisional-ciel.json";
import refundCiel from "@/hanjoo/lib/data/refund-ciel.json";
import simpleRateCiel from "@/hanjoo/lib/data/simple-rate-ciel.json";
import simpleRefundCiel from "@/hanjoo/lib/data/simple-refund-ciel.json";
import usageCiel from "@/hanjoo/lib/data/usage-ciel.json";
import { formatHs } from "@/hanjoo/lib/hs-format";

const CIEL = "https://www.clhs.co.kr";
const LAW_HOME = "https://www.law.go.kr/법령/관세법";
const RATE_FILE = "https://www.data.go.kr/data/15051179/fileData.do";
const RATE_SCREEN = "https://unipass.customs.go.kr/csp/index.do?tgMenuId=MYC_MNU_00000337";

export type DutySource = {
  name: string;
  url: string;
  db: "있음" | "없음" | "참고";
  detail: string;
};

export type DutyRow = Record<string, string>;

export type DutyKindRow = {
  group: string;
  name: string;
  detail: string;
  condition: string;
  symbol: string;
  law: string;
  href: string;
  missing: boolean;
};

type KindSpec = {
  group: string;
  name: string;
  detail?: string;
  condition?: string;
  code: string;
  law: string;
  lawTitle: string;
  fallback: string;
  href?: string;
};

const KIND_SPEC: KindSpec[] = [
  { group: "기본관세", name: "기본관세", code: "A", law: "관세법 제50조", lawTitle: "세율 적용의 우선순위", fallback: "기본관세" },
  { group: "잠정관세", name: "잠정관세", code: "B", law: "관세법 제50조", lawTitle: "세율 적용의 우선순위", fallback: "잠정관세" },
  { group: "탄력관세", name: "덤핑방지관세", code: "I", law: "관세법 제51조", lawTitle: "덤핑방지관세의 부과대상", fallback: "덤핑방지관세", href: "/rates/duty/dumping" },
  { group: "탄력관세", name: "긴급관세", code: "K", law: "관세법 제65조", lawTitle: "긴급관세의 부과대상 등", fallback: "긴급관세", href: "/rates/duty/safeguard" },
  { group: "탄력관세", name: "특정국물품긴급관세", code: "", law: "관세법 제67조의2", lawTitle: "특정국물품 긴급관세의 부과", fallback: "특정국물품긴급관세", href: "/rates/duty/country-safeguard" },
  { group: "탄력관세", name: "특별긴급관세", detail: "물량기준", code: "T1", law: "관세법 제68조", lawTitle: "농림축산물에 대한 특별긴급관세", fallback: "특별긴급관세", href: "/rates/duty/special-safeguard" },
  { group: "탄력관세", name: "특별긴급관세", detail: "가격기준", code: "T2", law: "관세법 제68조", lawTitle: "농림축산물에 대한 특별긴급관세", fallback: "특별긴급관세", href: "/rates/duty/special-safeguard" },
  { group: "탄력관세", name: "조정관세", code: "L", law: "관세법 제69조", lawTitle: "조정관세의 부과대상", fallback: "조정관세", href: "/rates/duty/adjustment" },
  { group: "탄력관세", name: "할당관세", detail: "추천(수량제한품목)", code: "P1", law: "관세법 제71조", lawTitle: "할당관세", fallback: "할당관세", href: "/rates/duty/quota" },
  { group: "탄력관세", name: "할당관세", detail: "미추천(수입전량품목)", code: "P3", law: "관세법 제71조", lawTitle: "할당관세", fallback: "할당관세", href: "/rates/duty/quota" },
  { group: "양허관세", name: "WTO 일반양허관세", detail: "공산품·수산물 및 단순 양허한 농림축산물에 대한 양허관세", code: "C", law: "관세법 제73조", lawTitle: "국제협력관세", fallback: "WTO 일반양허관세", href: "/rates/duty/wto" },
  { group: "양허관세", name: "WTO 일반양허관세", detail: "국내외 가격차에 상당한 율로 양허한 농림축산물에 대한 양허관세", condition: "추천", code: "W1", law: "관세법 제73조", lawTitle: "국제협력관세", fallback: "WTO 일반양허관세", href: "/rates/duty/wto" },
  { group: "양허관세", name: "WTO 일반양허관세", detail: "국내외 가격차에 상당한 율로 양허한 농림축산물에 대한 양허관세", condition: "미추천", code: "W2", law: "관세법 제73조", lawTitle: "국제협력관세", fallback: "WTO 일반양허관세", href: "/rates/duty/wto" },
  { group: "양허관세", name: "WTO 개발도상국간의 양허관세(TNDC)", code: "D", law: "관세법 제73조", lawTitle: "국제협력관세", fallback: "WTO 개발도상국간의 양허관세", href: "/rates/duty/wto-tndc" },
  { group: "양허관세", name: "아시아·태평양 무역협정 양허관세(APTA)", detail: "일반양허관세", code: "E1", law: "관세법 제73조", lawTitle: "국제협력관세", fallback: "APTA 일반양허관세", href: "/rates/duty/wto-apta" },
  { group: "양허관세", name: "아시아·태평양 무역협정 양허관세(APTA)", detail: "녹차의 일반양허관세", code: "E1", law: "관세법 제73조", lawTitle: "국제협력관세", fallback: "APTA 녹차 양허관세", href: "/rates/duty/wto-apta" },
  { group: "양허관세", name: "아시아·태평양 무역협정 양허관세(APTA)", detail: "방글라데시에 대한 양허관세", code: "E2", law: "관세법 제73조", lawTitle: "국제협력관세", fallback: "APTA 방글라데시 양허관세", href: "/rates/duty/wto-apta" },
  { group: "양허관세", name: "아시아·태평양 무역협정 양허관세(APTA)", detail: "라오스에 대한 양허관세", code: "E3", law: "관세법 제73조", lawTitle: "국제협력관세", fallback: "APTA 라오스 양허관세", href: "/rates/duty/wto-apta" },
  { group: "양허관세", name: "유엔무역개발회의 개발도상국간 특혜무역제도에 관한 협정(GSTP)", code: "G", law: "관세법 제73조", lawTitle: "국제협력관세", fallback: "GSTP 양허관세", href: "/rates/duty/wto-gstp" },
  { group: "양허관세", name: "특정국가와의 관세협상에 따른 국제협력관세", code: "F", law: "관세법 제73조", lawTitle: "국제협력관세", fallback: "국제협력관세", href: "/rates/duty/wto-coop" },
  { group: "편익관세", name: "편익관세", code: "N", law: "관세법 제74조", lawTitle: "편익관세의 적용", fallback: "편익관세" },
  { group: "특혜관세", name: "최빈개발도상국에 대한 특혜관세", code: "R", law: "관세법 제76조", lawTitle: "일반특혜관세의 적용", fallback: "특혜관세", href: "/rates/duty/wto-ldc" },
  { group: "간이세율", name: "간이세율", code: "X", law: "관세법 제81조", lawTitle: "간이세율의 적용", fallback: "간이세율" },
  { group: "북한산", name: "남북교류협력에 관한 법률에 의한 과세특례", code: "U", law: "남북교류협력법 제26조", lawTitle: "다른 법률의 준용", fallback: "북한산 과세특례" },
];

type Menu = {
  code: string;
  title: string;
  mode:
    | "law"
    | "codes"
    | "kindmap"
    | "items"
    | "articles"
    | "domestic"
    | "domesticTax"
    | "simpleRate"
    | "usage"
    | "simple"
    | "ssg"
    | "provisional"
    | "wto"
    | "concession"
    | "refundCiel";
  symbols: string[];
  symbolQuery?: "wto";
  laws: { lawId: string; title: string }[];
  articleLawId?: string;
  articleLike?: string;
  gap?: string;
  taxPageKey?: string;
};

const MENUS: Menu[] = [
  {
    code: "priority",
    title: "세율적용의 우선순위",
    mode: "law",
    symbols: [],
    laws: [
      { lawId: "001556", title: "세율 적용의 우선순위" },
      { lawId: "010097", title: "세율 적용의 우선순위" },
    ],
  },
  {
    code: "kinds",
    title: "관세의종류",
    mode: "kindmap",
    symbols: [],
    laws: [{ lawId: "001556", title: "세율의 종류" }],
    gap: "특정국물품긴급관세 부호는 bgwanse에 없음. 법령은 관세법 제67조의2. https://www.law.go.kr/법령/관세법",
  },
  {
    code: "flexible",
    title: "탄력관세",
    mode: "kindmap",
    symbols: [],
    laws: [
      { lawId: "001556", title: "덤핑방지관세의 부과대상" },
      { lawId: "001556", title: "긴급관세의 부과대상 등" },
      { lawId: "001556", title: "특정국물품 긴급관세의 부과" },
      { lawId: "001556", title: "농림축산물에 대한 특별긴급관세" },
      { lawId: "001556", title: "조정관세의 부과대상" },
      { lawId: "001556", title: "할당관세" },
    ],
  },
  {
    code: "provisional",
    title: "잠정관세",
    mode: "provisional",
    symbols: ["B"],
    laws: [
      { lawId: "001556", title: "세율의 종류" },
      { lawId: "001556", title: "세율 적용의 우선순위" },
    ],
    gap: "CIEL b.asp 별표 적용시한 2006.12.30. clip_tariff_rate 부호 B 0건",
  },
  {
    code: "dumping",
    title: "덤핑방지관세",
    mode: "items",
    symbols: ["I"],
    laws: [
      { lawId: "001556", title: "덤핑방지관세의 부과대상" },
      { lawId: "001556", title: "덤핑 및 실질적 피해등의 조사" },
      { lawId: "001556", title: "덤핑방지관세를 부과하기 전의 잠정조치" },
      { lawId: "001556", title: "덤핑방지관세와 관련된 약속의 제의" },
      { lawId: "001556", title: "덤핑방지관세의 부과 시기" },
      { lawId: "001556", title: "덤핑방지관세에 대한 재심사 등" },
      { lawId: "001556", title: "우회덤핑 물품에 대한 덤핑방지관세의 부과" },
    ],
  },
  {
    code: "safeguard",
    title: "긴급관세",
    mode: "items",
    symbols: ["K"],
    laws: [
      { lawId: "001556", title: "긴급관세의 부과대상 등" },
      { lawId: "001556", title: "잠정긴급관세의 부과 등" },
      { lawId: "001556", title: "긴급관세에 대한 재심사 등" },
    ],
  },
  {
    code: "country-safeguard",
    title: "특정국물품긴급관세",
    mode: "items",
    symbols: [],
    laws: [{ lawId: "001556", title: "특정국물품 긴급관세의 부과" }],
  },
  {
    code: "special-safeguard",
    title: "특별긴급관세",
    mode: "ssg",
    symbols: ["T1", "T2"],
    laws: [{ lawId: "001556", title: "농림축산물에 대한 특별긴급관세" }],
    gap: "기준발동물량(2026년 쌀 507,279톤)은 CIEL T.asp 값. clip_tariff_rate에는 없음",
  },
  {
    code: "adjustment",
    title: "조정관세",
    mode: "items",
    symbols: ["L"],
    laws: [
      { lawId: "001556", title: "조정관세의 부과대상" },
      { lawId: "001556", title: "조정관세의 적용 세율 등" },
    ],
  },
  {
    code: "quota",
    title: "할당관세",
    mode: "items",
    symbols: ["P1", "P2", "P3", "P4"],
    laws: [{ lawId: "001556", title: "할당관세" }],
  },
  {
    code: "wto",
    title: "WTO 일반양허관세",
    mode: "wto",
    symbols: ["C", "C1", "C2", "C2A1", "C2A2", "C2A3", "C2A4", "C2A5", "C2A6", "C2A7", "C2A8", "C5", "C6", "W1", "W2", "W3"],
    laws: [{ lawId: "001556", title: "국제협력관세" }],
    gap: "안내 본문은 CIEL C.asp. 회원국 명단은 CIEL 2026.1.1 기준 166개국",
  },
  {
    code: "wto-tndc",
    title: "WTO 개발도상국간의 양허관세",
    mode: "concession",
    symbols: ["D"],
    laws: [{ lawId: "001556", title: "국제협력관세" }],
    gap: "CIEL D.asp TNDC",
  },
  {
    code: "wto-apta",
    title: "아시아·태평양 무역협정 양허관세",
    mode: "concession",
    symbols: [
      "E1", "E1A1", "E1A2", "E1A3", "E1A4", "E1A5", "E1A6", "E1A7", "E1A8", "E1A9", "E1A10",
      "E1B1", "E1B2", "E1B3", "E1B4", "E2", "E2A1", "E2A2", "E2A3", "E3", "E3A1", "E3A2", "E3A3",
    ],
    laws: [{ lawId: "001556", title: "국제협력관세" }],
    gap: "CIEL E.asp APTA",
  },
  {
    code: "wto-gstp",
    title: "유엔무역개발회의 개발도상국간 협정관세",
    mode: "concession",
    symbols: ["G1", "G2"],
    laws: [{ lawId: "001556", title: "국제협력관세" }],
    gap: "CIEL G.asp GSTP",
  },
  {
    code: "wto-coop",
    title: "특정국가와의 관세협상에 따른 국제협력관세",
    mode: "concession",
    symbols: ["F"],
    laws: [{ lawId: "001556", title: "국제협력관세" }],
    gap: "CIEL F.asp 국제협력관세",
  },
  {
    code: "wto-ldc",
    title: "최빈개발도상국에 대한 특혜관세",
    mode: "concession",
    symbols: ["R"],
    laws: [{ lawId: "001556", title: "일반특혜관세의 적용" }],
    gap: "CIEL R.asp 최빈개도국 특혜관세",
  },
  {
    code: "domestic",
    title: "내국세의 종류",
    mode: "domestic",
    symbols: [],
    laws: [{ lawId: "001570", title: "과세대상과 세율" }],
  },
  {
    code: "domestic-spc",
    title: "개별소비세",
    mode: "domesticTax",
    symbols: [],
    taxPageKey: "domestic-spc",
    laws: [{ lawId: "001570", title: "과세대상과 세율" }],
  },
  {
    code: "domestic-tra",
    title: "교통·에너지·환경세",
    mode: "domesticTax",
    symbols: [],
    taxPageKey: "domestic-tra",
    laws: [{ lawId: "000623", title: "과세대상과 세율" }],
  },
  {
    code: "domestic-alc",
    title: "주세",
    mode: "domesticTax",
    symbols: [],
    taxPageKey: "domestic-alc",
    laws: [{ lawId: "001566", title: "세율" }],
  },
  {
    code: "domestic-edu",
    title: "교육세",
    mode: "domesticTax",
    symbols: [],
    taxPageKey: "domestic-edu",
    laws: [{ lawId: "001729", title: "과세표준과 세율" }],
  },
  {
    code: "domestic-agr",
    title: "농어촌특별세",
    mode: "domesticTax",
    symbols: [],
    taxPageKey: "domestic-agr",
    laws: [{ lawId: "001569", title: "과세표준과 세율" }],
  },
  {
    code: "domestic-add",
    title: "부가가치세",
    mode: "domesticTax",
    symbols: [],
    taxPageKey: "domestic-add",
    laws: [{ lawId: "001571", title: "세율" }],
  },
  {
    code: "domestic-local",
    title: "지방세",
    mode: "domesticTax",
    symbols: [],
    taxPageKey: "domestic-local",
    // CIEL 내국세>지방세 = iolaw.asp?strlaw=지방세법 (법령별 수출입요령>지방세법)
    laws: [],
  },
  {
    code: "simple-rate",
    title: "간이세율",
    mode: "simpleRate",
    symbols: ["X"],
    laws: [{ lawId: "001556", title: "간이세율의 적용" }],
  },
  {
    code: "usage",
    title: "용도세율 및 사후관리",
    mode: "usage",
    symbols: [],
    laws: [{ lawId: "001556", title: "용도세율의 적용" }],
  },
  {
    code: "installment",
    title: "분할납부",
    mode: "law",
    symbols: [],
    laws: [{ lawId: "001556", title: "관세의 분할납부" }],
  },
  {
    code: "refund",
    title: "관세환급",
    mode: "refundCiel",
    symbols: [],
    laws: [{ lawId: "001556", title: "계약내용과 다른 물품에 대한 관세의 환급" }],
    gap: "개별 수출건 환급액은 DB에 없음. CIEL cdb.asp 안내 + 관세법·환특법 요지",
  },
  {
    code: "simple-refund",
    title: "간이정액환급",
    mode: "simple",
    symbols: [],
    laws: [{ lawId: "000592", title: "정액환급률표" }],
  },
];

const PAGE_SIZE = 30;

function menuOf(code: string): Menu | undefined {
  return MENUS.find((menu) => menu.code === code);
}

async function articleText(db: SmartLawDb, lawId: string, title: string): Promise<string> {
  const law = await db.get(`SELECT id, law_name_kr AS name FROM laws WHERE law_id = ?`, [lawId]);
  if (!law?.id) return "";
  const ver = await db.get(`SELECT id, enforcement_date AS enf FROM law_versions WHERE law_id = ? AND is_current = 1`, [law.id]) as { id?: number; enf?: string } | undefined;
  if (!ver?.id) return "";
  const article = await db.get(`SELECT id, article_content AS content FROM law_articles
        WHERE law_version_id = ? AND article_type = '조문' AND article_title = ? LIMIT 1`, [ver.id, title]) as { id?: number; content?: string } | undefined;
  if (!article?.id) return "";
  const items = (await db.all(`SELECT item_content AS text FROM law_article_items WHERE law_article_id = ? ORDER BY display_order, id`, [article.id])) as { text?: string }[];
  const body = [String(article.content ?? ""), ...items.map((item) => String(item.text ?? "").trim())]
    .filter(Boolean)
    .join("\n");
  const head = `${law.name ?? ""} ${body.match(/^제\d+조(?:의\d+)?/)?.[0] ?? ""}`.trim();
  const enf = ver.enf ? ` (시행 ${ver.enf})` : "";
  return `${head}${enf}\n${body}`.slice(0, 2500);
}

export type DutyFormula = {
  id?: string;
  kind: "fraction";
  numerator: string;
  denominator: string | { kind: "one-plus-fraction"; prefix: string; numerator: string; denominator: string };
  note?: string;
  afterLinePrefix?: string;
};

export type DutySection = {
  title: string;
  lines: string[];
  table?: { columns: string[]; rows: string[][] };
  afterLines?: string[];
  formulas?: DutyFormula[];
};

export async function getDutyView(code: string, pageRaw: number, hsRaw = ""): Promise<{
  title: string;
  sources: DutySource[];
  columns: string[];
  rows: DutyRow[];
  total: number;
  page: number;
  pageSize: number;
  lawText: string;
  kinds: DutyKindRow[];
  notes: { heading: string; text: string }[];
  flexIntro: string;
  sections: DutySection[];
  tailSections?: DutySection[];
  reductionLinks?: { law: string; name: string; href: string; related: { name: string; href: string }[] }[];
  tableKind?: "provisional";
  hsQuery?: string;
  searchHs?: boolean;
} | null> {
  if (isReductionCode(code)) {
    return await getReductionView(code, pageRaw, hsRaw);
  }
  const menu = menuOf(code);
  if (!menu) return null;
  const hsQuery = String(hsRaw ?? "").replace(/\D/g, "");
  const db = await openSmartLawDb();
  try {
    const laws = (
      await Promise.all(menu.laws.map((law) => articleText(db, law.lawId, law.title)))
    ).filter(Boolean);
    const symbols =
      menu.symbolQuery === "wto"
        ? (
            (await db.all(
              `SELECT Gwanse_code AS code FROM bgwanse WHERE Gwanse_semyung LIKE 'WTO협정세율%' ORDER BY Gwanse_code`,
            )) as { code?: string }[]
          )
            .map((row) => String(row.code ?? ""))
            .filter(Boolean)
        : menu.symbols;

    const kinds =
      menu.mode === "kindmap"
        ? (await kindRows(db)).filter((row) => menu.code !== "flexible" || row.group === "탄력관세")
        : [];
    let total = 0;
    let rows: DutyRow[] = [];
    let columns: string[] = [];
    if (menu.mode === "kindmap") {
      total = kinds.length;
      columns = ["구분", "관세", "세부구분", "적용", "부호", "관련법령"];
    } else if (menu.mode === "ssg") {
      const ssg = await buildSsg(db);
      columns = ssg.columns;
      rows = ssg.rows;
      total = rows.length;
    } else if (menu.mode === "provisional") {
      const provisional = buildProvisional();
      columns = provisional.columns;
      rows = provisional.rows;
      total = rows.length;
    } else if (menu.mode === "wto") {
      columns = [];
      rows = [];
      total = 0;
    } else if (menu.mode === "codes") {
      const found = (await db.all(
        `SELECT Gwanse_code AS code, Gwanse_gubun AS gubun, Gwanse_semyung AS name
             FROM bgwanse
            WHERE Gwanse_gubun IN ('기본','잠정','가트','개도','국제','유엔','덤핑','보복','긴급','조정','상계','할당','할예','특별','추양','미양','증량','간이','협정')
            ORDER BY Gwanse_gubun, Gwanse_code`,
      )) as { code?: string; gubun?: string; name?: string }[];
      total = found.length;
      columns = ["부호", "구분", "세율명"];
      rows = found.map((row) => ({
        부호: String(row.code ?? ""),
        구분: String(row.gubun ?? ""),
        세율명: String(row.name ?? ""),
      }));
    } else if ((menu.mode === "items" || menu.mode === "concession") && symbols.length) {
      const marks = symbols.map(() => "?").join(",");
      const allowHs = menu.code === "wto-coop" && hsQuery;
      const hsClause = allowHs
        ? ` AND (
             REPLACE(REPLACE(REPLACE(IFNULL(hs_code,''),'.',''),'-',''),' ','') LIKE ?
             OR REPLACE(REPLACE(REPLACE(IFNULL(hs_code_display,''),'.',''),'-',''),' ','') LIKE ?
           )`
        : "";
      const hsArgs = allowHs ? [`${hsQuery}%`, `${hsQuery}%`] : [];
      total = Number(
        (
          (await db.get(
            `SELECT COUNT(*) AS n FROM clip_tariff_rate WHERE category_symbol IN (${marks})${hsClause}`,
            [...symbols, ...hsArgs],
          )) as { n?: number } | undefined
        )?.n ?? 0,
      );
      const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
      const page = Math.min(Math.max(1, pageRaw || 1), pageCount);
      const offset = (page - 1) * PAGE_SIZE;
      const found = (await db.all(
        `SELECT hs_code_display AS hs, item_name AS name, category_symbol AS symbol,
                  tariff_rate AS rate, amount_per_unit AS amount,
                  effective_start_date AS "startAt", effective_end_date AS "endAt"
             FROM clip_tariff_rate
            WHERE category_symbol IN (${marks})${hsClause}
            ORDER BY category_symbol, hs_code
            LIMIT ? OFFSET ?`,
        [...symbols, ...hsArgs, PAGE_SIZE, offset],
      )) as Record<string, unknown>[];
      columns = ["HS", "품명", "부호", "세율", "적용시작", "적용종료"];
      rows = found.map((row) => {
        const rate = String(row.rate ?? "").trim();
        const amount = String(row.amount ?? "").trim();
        return {
          HS: String(row.hs ?? ""),
          품명: String(row.name ?? ""),
          부호: String(row.symbol ?? ""),
          세율: [rate, amount].filter(Boolean).join(" / "),
          적용시작: String(row.startAt ?? ""),
          적용종료: String(row.endAt ?? ""),
        };
      });
    } else if (menu.mode === "articles" && menu.articleLawId && menu.articleLike) {
      const law = (await db.get(`SELECT id FROM laws WHERE law_id = ?`, [
        menu.articleLawId,
      ])) as { id?: number } | undefined;
      const ver = law?.id
        ? ((await db.get(`SELECT id FROM law_versions WHERE law_id = ? AND is_current = 1`, [
            law.id,
          ])) as { id?: number } | undefined)
        : undefined;
      const found = ver?.id
        ? ((await db.all(
            `SELECT article_title AS title, article_content AS content
                 FROM law_articles
                WHERE law_version_id = ? AND article_type = '조문' AND article_title LIKE ?
                ORDER BY display_order, id`,
            [ver.id, menu.articleLike],
          )) as { title?: string; content?: string }[])
        : [];
      total = found.length;
      columns = ["조문", "제목"];
      rows = found.map((row) => ({
        조문: String(row.content ?? "").match(/^제\d+조(?:의\d+)?/)?.[0] ?? "",
        제목: String(row.title ?? ""),
      }));
    } else if (menu.mode === "domestic") {
      total = Number(
        (
          (await db.get(
            `SELECT COUNT(*) AS n FROM tariff_domestic_tax WHERE year = 2026 AND country_code = 'KR'`,
          )) as { n?: number } | undefined
        )?.n ?? 0,
      );
      const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
      const page = Math.min(Math.max(1, pageRaw || 1), pageCount);
      const found = (await db.all(
        `SELECT hs_code AS hs, tax_category AS category, tax_rate AS rate, tax_code AS code, effective_period AS period
             FROM tariff_domestic_tax
            WHERE year = 2026 AND country_code = 'KR'
            ORDER BY hs_code, tax_sequence
            LIMIT ? OFFSET ?`,
        [PAGE_SIZE, (page - 1) * PAGE_SIZE],
      )) as Record<string, unknown>[];
      columns = ["HS", "세목", "세율", "부호", "적용기간"];
      rows = found.map((row) => ({
        HS: String(row.hs ?? ""),
        세목: String(row.category ?? ""),
        세율: String(row.rate ?? ""),
        부호: String(row.code ?? ""),
        적용기간: String(row.period ?? ""),
      }));
      // CIEL overview injected via sections below (domesticSections)
    } else if (menu.mode === "simpleRate") {
      // CIEL X.asp overview + code table; clip_tariff_rate 부호 X 0건
      columns = [];
      rows = [];
      total = 0;
    } else if (menu.mode === "domesticTax") {
      columns = [];
      rows = [];
      total = 0;
    } else if (menu.mode === "usage") {
      const hsClause = hsQuery
        ? ` AND REPLACE(REPLACE(REPLACE(IFNULL(hs_code,''),'.',''),'-',''),' ','') LIKE ?`
        : "";
      const hsArgs = hsQuery ? [`${hsQuery}%`] : [];
      const where = `year = 2026 AND country_code = 'KR' AND reduction LIKE '용도세율%'${hsClause}`;
      total = Number(
        (
          (await db.get(`SELECT COUNT(*) AS n FROM tariff_item WHERE ${where}`, hsArgs)) as {
            n?: number;
          } | undefined
        )?.n ?? 0,
      );
      const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
      const page = Math.min(Math.max(1, pageRaw || 1), pageCount);
      const found = (await db.all(
        `SELECT hs_code AS hs, item_name AS name, reduction AS value
             FROM tariff_item
            WHERE ${where}
            ORDER BY hs_code
            LIMIT ? OFFSET ?`,
        [...hsArgs, PAGE_SIZE, (page - 1) * PAGE_SIZE],
      )) as Record<string, unknown>[];
      columns = ["HS", "품명", "용도", "세율", "사후관리"];
      rows = found.map((row) => {
        const parsed = parseUsageReduction(String(row.value ?? ""));
        return {
          HS: formatHs(String(row.hs ?? "")),
          품명: String(row.name ?? ""),
          용도: parsed.usage,
          세율: parsed.symbol,
          사후관리: parsed.post,
        };
      });
    } else if (menu.mode === "refundCiel") {
      columns = [];
      rows = [];
      total = 0;
    } else if (menu.mode === "simple") {
      const where = `year = 2026 AND country_code = 'KR' AND TRIM(COALESCE(simple_refund, '')) <> ''`;
      total = Number(
        (
          (await db.get(`SELECT COUNT(*) AS n FROM tariff_item WHERE ${where}`)) as {
            n?: number;
          } | undefined
        )?.n ?? 0,
      );
      const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
      const page = Math.min(Math.max(1, pageRaw || 1), pageCount);
      const found = (await db.all(
        `SELECT hs_code AS hs, item_name AS name, simple_refund AS value
             FROM tariff_item
            WHERE ${where}
            ORDER BY hs_code
            LIMIT ? OFFSET ?`,
        [PAGE_SIZE, (page - 1) * PAGE_SIZE],
      )) as Record<string, unknown>[];
      columns = ["HS", "품명", "간이정액환급"];
      rows = found.map((row) => ({
        HS: formatHs(String(row.hs ?? "")),
        품명: String(row.name ?? ""),
        간이정액환급: String(row.value ?? ""),
      }));
    }

    const priority = menu.code === "priority" ? await buildPriority(db) : null;
    if (priority) {
      columns = ["순위", "세율", "적용"];
      rows = priority.rows;
      total = rows.length;
    }
    const symbolLabel = symbols.length > 8 ? `${symbols.length}종` : symbols.join(", ");
    const itemDb = priority
      ? total > 0
        ? "있음"
        : "없음"
      : menu.mode === "law"
        ? "없음"
        : menu.mode === "refundCiel" || menu.mode === "domesticTax" || menu.mode === "simpleRate"
          ? "참고"
          : total > 0
            ? "있음"
            : "없음";
    const itemDetail =
      priority
        ? total > 0
          ? "관세법 제50조와 FTA관세특례법 제5조로 순위표를 구성"
          : "세율 적용의 우선순위 조문 없음"
        : menu.mode === "law"
          ? "국가별 우선순위 매트릭스 또는 품목 목록은 DB에 없음. 아래는 법령 조문"
          : menu.mode === "articles"
            ? total > 0
              ? `law_articles ${total}건`
              : "해당 제목의 조문 없음"
            : menu.mode === "domestic"
              ? total > 0
                ? `CIEL induty.asp 개요 + tariff_domestic_tax ${total}건`
                : "CIEL induty.asp 개요. tariff_domestic_tax 0건"
              : menu.mode === "simpleRate"
                ? "CIEL X.asp 간이세율표·코드표. clip_tariff_rate 부호 X 0건"
                : menu.mode === "domesticTax"
                  ? `CIEL ${menu.taxPageKey ?? "내국세"} 화면`
                  : menu.mode === "usage"
                    ? total > 0
                      ? `CIEL PP.asp + tariff_item.reduction ${total}건`
                      : "CIEL PP.asp 안내. 용도세율 품목 0건"
                    : menu.mode === "simple"
                      ? total > 0
                        ? `CIEL db.asp + tariff_item.simple_refund ${total}건`
                        : "CIEL db.asp 안내. 간이정액환급 0건"
                      : menu.mode === "refundCiel"
                        ? "CIEL cdb.asp 관세환급 안내"
                        : menu.mode === "ssg"
                          ? `clip_tariff_rate T1/T2 ${total}건. 기준발동물량은 CIEL 2026 화면 값`
                          : menu.mode === "provisional"
                            ? `CIEL b.asp 별표 ${total}건(적용시한 2006.12.30). clip_tariff_rate 부호 B 0건`
                            : menu.mode === "wto"
                              ? "CIEL C.asp WTO 일반양허관세 안내. clip_tariff_rate C/W 품목은 관세율표에서 조회"
                              : menu.mode === "kindmap"
                                ? `구분표 ${kinds.length}행. bgwanse 부호 ${kinds.filter((row) => !row.missing).length}개, 부호 없음 ${kinds.filter((row) => row.missing).length}개. FTA협정관세 행은 넣지 않음`
                                : menu.mode === "codes"
                                  ? total > 0
                                    ? `bgwanse ${total}건`
                                    : "bgwanse에 해당 부호 없음"
                                  : symbols.length === 0
                                    ? "세율부호가 bgwanse에 없고 clip_tariff_rate 품목도 없음"
                                    : total > 0
                                      ? `clip_tariff_rate ${symbolLabel} ${total}건`
                                      : `clip_tariff_rate ${symbolLabel || "해당 부호"} 0건`;

    const refundLaw = "https://www.law.go.kr/법령/수출용원재료에대한관세등환급에관한특례법";
    const clipHs = "https://unipass.customs.go.kr/clip/hsinfosrch/openULS0201007Q.do";
    const rateUrl =
      menu.code === "refund" || menu.code === "simple-refund"
        ? refundLaw
        : menu.mode === "domestic"
          ? clipHs
          : menu.mode === "law" || menu.mode === "articles"
            ? LAW_HOME
            : RATE_FILE;
    const sources: DutySource[] = [
      { name: "CIEL 화면", url: CIEL, db: "참고", detail: "화면 구성 참고. DB 원본이 아님" },
      {
        name: "법령 원문",
        url: menu.code === "refund" || menu.code === "simple-refund" ? refundLaw : LAW_HOME,
        db: laws.length ? "있음" : "없음",
        detail: laws.length ? menu.laws.map((law) => law.title).join(", ") : "해당 조문 없음",
      },
      {
        name: "자료 원본",
        url: rateUrl,
        db: itemDb,
        detail:
          menu.mode === "items" || menu.mode === "codes" || menu.mode === "concession"
            ? `${itemDetail}. 조회 화면 ${RATE_SCREEN}`
            : itemDetail,
      },
    ];
    if (menu.gap) sources.push({ name: "추가 확인", url: CIEL, db: "없음", detail: menu.gap });

    const paged =
      menu.mode === "items" ||
      menu.mode === "concession" ||
      menu.mode === "domestic" ||
      menu.mode === "usage" ||
      menu.mode === "simple";
    return {
      title: menu.title,
      sources,
      columns,
      rows,
      total,
      page: paged ? Math.min(Math.max(1, pageRaw || 1), Math.max(1, Math.ceil(total / PAGE_SIZE))) : 1,
      pageSize: paged ? PAGE_SIZE : Math.max(total, 1),
      lawText:
        menu.mode === "kindmap" ||
        menu.mode === "ssg" ||
        menu.mode === "provisional" ||
        menu.mode === "wto" ||
        menu.mode === "concession" ||
        menu.mode === "domestic" ||
        menu.mode === "domesticTax" ||
        menu.mode === "simpleRate" ||
        menu.mode === "usage" ||
        menu.mode === "refundCiel" ||
        menu.mode === "simple" ||
        menu.code === "priority"
          ? ""
          : laws.join("\n\n"),
      kinds,
      notes: priority?.notes ?? [],
      flexIntro:
        menu.code === "flexible"
          ? await articleText(db, "001556", "세율의 종류")
          : "",
      sections:
        menu.mode === "ssg"
          ? ssgSections()
          : menu.mode === "provisional"
            ? provisionalSections()
            : menu.mode === "wto"
              ? wtoSections()
              : menu.mode === "concession"
                ? concessionSections(menu.code)
                : menu.mode === "domestic"
                  ? domesticSections()
                  : menu.mode === "domesticTax"
                    ? domesticTaxSections(menu.taxPageKey || menu.code)
                    : menu.mode === "simpleRate"
                      ? simpleRateSections()
                      : menu.mode === "refundCiel"
                        ? refundSections()
                        : menu.mode === "simple"
                          ? simpleRefundSections()
                          : [],
      tailSections: menu.mode === "usage" ? usageTailSections() : undefined,
      tableKind: menu.mode === "provisional" ? "provisional" : undefined,
      hsQuery,
      searchHs: menu.code === "wto-coop" || menu.mode === "usage",
    };
  } finally {
    await db.close();
  }
}

function domesticSections(): DutySection[] {
  const table = domesticCiel.table as { columns: string[]; rows: string[][] };
  return [
    {
      title: "1. 수입물품에 부과되는 내국세",
      lines: (domesticCiel.intro as string[]) ?? [],
    },
    {
      title: "2. 내국세의 과세표준 및 세율",
      lines: [],
      table: { columns: table.columns, rows: table.rows },
    },
    {
      title: "3. 품목별 내국세 (DB)",
      lines: ["아래 표는 smart_law_ai.db · tariff_domestic_tax (2026, KR) 품목별 내국세입니다."],
    },
  ];
}

/** CIEL PP.asp: `용도세율 [세종] … [용도·규격] … [사후관리] Y` */
function parseUsageReduction(raw: string): { symbol: string; usage: string; post: string } {
  const text = String(raw ?? "").trim();
  const symbol = text.match(/\[세종\]\s*([^[]*?)(?=\s*\[|$)/)?.[1]?.trim() ?? "";
  const usage = text.match(/\[용도[·･･・]?규격\]\s*([^[]*?)(?=\s*\[|$)/)?.[1]?.trim() ?? "";
  const post = text.match(/\[사후관리\]\s*([^[]*?)(?=\s*\[|$)/)?.[1]?.trim() ?? "";
  if (symbol || usage || post) {
    return { symbol: symbol || "—", usage: usage || "—", post: post || "—" };
  }
  return { symbol: text.replace(/^용도세율\s*/, "") || "—", usage: "—", post: "—" };
}

function usageTailSections(): DutySection[] {
  const intro = ((usageCiel.intro as string[]) ?? []).map((line) =>
    line.replace(/\n+/g, " ").replace(/\s+/g, " ").trim(),
  );
  const period = usageCiel.periodTable as { columns: string[]; rows: string[][] } | undefined;
  const sections: DutySection[] = [];
  if (intro.length) {
    sections.push({ title: "적용법령·사후관리기간", lines: intro });
  }
  if (period?.columns?.length && period.rows?.length) {
    sections.push({
      title: "고시에 따른 사후관리기간",
      lines: [],
      table: {
        columns: period.columns,
        rows: period.rows.map((row) => row.map((cell) => String(cell ?? "").replace(/\n+/g, "\n").trim())),
      },
    });
  }
  return sections;
}

function domesticTaxSections(pageKey: string): DutySection[] {
  const pages = (domesticTaxesCiel as { pages?: Record<string, {
    title?: string;
    intro?: string[];
    sections?: {
      title?: string;
      lines?: string[];
      table?: { columns: string[]; rows: string[][] };
    }[];
    tables?: { columns: string[]; rows: string[][]; sectionTitle?: string }[];
  }> }).pages ?? {};
  const page = pages[pageKey];
  if (!page) {
    return [{ title: "안내", lines: ["해당 내국세 화면 자료가 없습니다."] }];
  }
  const sections: DutySection[] = [];
  const lettered = (page.sections ?? [])
    .map((sec) => {
      const table = sec.table?.columns?.length
        ? {
            columns: sec.table.columns.map((c) => String(c ?? "")),
            rows: (sec.table.rows ?? []).map((row) => row.map((cell) => String(cell ?? ""))),
          }
        : undefined;
      return {
        title: String(sec.title ?? "").trim(),
        lines: (sec.lines ?? []).map((line) => String(line).trim()).filter(Boolean),
        ...(table ? { table } : {}),
      };
    })
    .filter((sec) => sec.title || sec.lines.length || sec.table);
  if (lettered.length) {
    sections.push(...lettered);
  } else {
    const intro = (page.intro ?? []).filter(Boolean);
    if (intro.length) {
      sections.push({ title: page.title || "개요", lines: intro });
    }
  }
  const tables = page.tables ?? [];
  tables.forEach((table, index) => {
    const rateIdx = table.columns.findIndex((c) => c === "세율" || c === "기본세율" || c === "탄력세율");
    const rows = table.rows.map((row) =>
      row.map((cell, i) => {
        const text = String(cell ?? "");
        // 세율류는 한 줄로 붙여 과세대상과 나란히 읽기 쉽게
        if (rateIdx >= 0 && (table.columns[i] === "세율" || table.columns[i] === "기본세율" || table.columns[i] === "탄력세율")) {
          return text.replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim();
        }
        return text;
      }),
    );
    const title =
      table.sectionTitle?.trim() ||
      (tables.length > 1 ? `${index + 1}. ${page.title || "표"}` : page.title || "과세표준 및 세율");
    sections.push({
      title,
      lines: [],
      table: { columns: table.columns, rows },
    });
  });
  if (!sections.length) {
    sections.push({ title: page.title || "안내", lines: ["표시할 내용이 없습니다."] });
  }
  return sections;
}

function refundSections(): DutySection[] {
  const sections = (refundCiel.sections ?? []) as { title?: string; lines?: string[] }[];
  return sections
    .map((sec) => ({
      title: String(sec.title ?? "안내"),
      lines: (sec.lines ?? []).map((line) => String(line)),
    }))
    .filter((sec) => sec.lines.length > 0 || sec.title);
}

function simpleRefundSections(): DutySection[] {
  const sections = (simpleRefundCiel.sections ?? []) as {
    title?: string;
    lines?: string[];
    table?: { columns: string[]; rows: string[][] };
    formulas?: DutyFormula[];
  }[];
  const out: DutySection[] = sections
    .map((sec) => ({
      title: String(sec.title ?? "안내"),
      lines: (sec.lines ?? []).map((line) => String(line)),
      table: sec.table,
      formulas: sec.formulas,
    }))
    .filter((sec) => sec.lines.length > 0 || sec.table || (sec.formulas?.length ?? 0) > 0);
  if (out.length) {
    out.push({
      title: "간이정액환급률표 (DB)",
      lines: ["아래 표는 smart_law_ai.db tariff_item.simple_refund(2026) 값입니다. HS10단위 일치 여부로 적용합니다."],
    });
  }
  return out;
}

function simpleRateSections(): DutySection[] {
  const rate = simpleRateCiel.rateTable as { title: string; columns: string[]; rows: string[][] };
  const codes = simpleRateCiel.codeTable as { title: string; columns: string[]; rows: string[][] };
  return [
    {
      title: "1. 간이세율의 적용·비적용",
      lines: (simpleRateCiel.intro as string[]) ?? [],
    },
    {
      title: rate.title || "2. 간이세율표",
      lines: [],
      table: { columns: rate.columns, rows: rate.rows },
    },
    {
      title: codes.title || "3. 간이세율코드표",
      lines: [],
      table: { columns: codes.columns, rows: codes.rows },
    },
  ];
}

function wtoSections(): DutySection[] {
  return [
    {
      title: "1. 관련법령",
      lines: [
        "가. 세계무역기구협정등에 의한 양허관세규정 [대통령령 제35126호, 2024. 12. 31.]",
        "나. 농축산물 시장접근물량 양허관세 추천 및 수입관리요령 [농림축산식품부고시]",
        "다. 외화획득용 원료수입 및 사후관리요령 [농림수산식품부고시]",
      ],
    },
    {
      title: "2. 세율 및 적용 우선순위 (관세법 제50조, 양허관세규정 제6조)",
      lines: [],
      table: {
        columns: ["세율", "적용 우선순위"],
        rows: [
          [
            "공산품·수산물 및 단순 양허한 농림축산물에 대한 양허관세 (C)",
            "기본세율, 잠정세율 및 조정관세, 할당관세, 계절관세, 일반특혜관세의 세율 보다 낮은 경우에만 우선하여 적용",
          ],
          [
            "국내외 가격차에 상당한 율로 양허하거나 국내시장개방과 함께 기본세율보다 높은 세율로 양허한 농림축산물에 대한 양허관세 (W1, W2)",
            "기본세율 및 잠정세율에 우선하여 적용\n다만, 품목번호 1806.90-2290, 1806.90-2999, 1901.20-1000, 1901.20-9000, 1901.90-9091, 1901.90-9099 중 쌀가루가 포함되지 않았거나 열을 가해 볶거나 찌는 등의 과정을 거쳐 성상과 전분구조가 완전히 변형된 경우에는 기본세율 및 잠정세율에 우선하여 적용하지 않음",
          ],
        ],
      },
    },
    {
      title: "3. 적용국가",
      lines: [
        "가. WTO회원국(2026년 1월 1일 기준 166개국 - 참조 https://www.wto.org)",
        "A: Afghanistan; Albania; Angola; Antigua and Barbuda; Argentina; Armenia; Australia; Austria",
        "B: Bahrain, Kingdom of; Bangladesh; Barbados; Belgium; Belize; Benin; Bolivia, Plurinational State of; Botswana; Brazil; Brunei Darussalam; Bulgaria; Burkina Faso; Burundi",
        "C: Cabo Verde; Cambodia; Cameroon; Canada; Central African Republic; Chad; Chile; China; Colombia; Comoros; Congo; Costa Rica; Cote d'Ivoire; Croatia; Cuba; Cyprus; Czech Republic",
        "D: Democratic Republic of the Congo; Denmark; Djibouti; Dominica; Dominican Republic",
        "E: Ecuador; Egypt; El Salvador; Estonia; Eswatini; European Union",
        "F: Fiji; Finland; France",
        "G: Gabon; Gambia; Georgia; Germany; Ghana; Greece; Grenada; Guatemala; Guinea; Guinea-Bissau; Guyana",
        "H: Haiti; Honduras; Hong Kong, China; Hungary",
        "I: Iceland; India; Indonesia; Ireland; Israel; Italy",
        "J: Jamaica; Japan; Jordan",
        "K: Kazakhstan; Kenya; Korea, Republic of; Kuwait, the State of; Kyrgyz Republic",
        "L: Lao People's Democratic Republic; Latvia; Lesotho; Liberia; Liechtenstein; Lithuania; Luxembourg",
        "M: Macao, China; Madagascar; Malawi; Malaysia; Maldives; Mali; Malta; Mauritania; Mauritius; Mexico; Moldova, Republic of; Mongolia; Montenegro; Morocco; Mozambique; Myanmar",
        "N: Namibia; Nepal; Netherlands; New Zealand; Nicaragua; Niger; Nigeria; North Macedonia; Norway",
        "O: Oman",
        "P: Pakistan; Panama; Papua New Guinea; Paraguay; Peru; Philippines; Poland; Portugal",
        "Q: Qatar",
        "R: Romania; Russian Federation; Rwanda",
        "S: Saint Kitts and Nevis; Saint Lucia; Saint Vincent and the Grenadines; Samoa; Saudi Arabia, Kingdom of; Senegal; Seychelles; Sierra Leone; Singapore; Slovak Republic; Slovenia; Solomon Islands; South Africa; Spain; Sri Lanka; Suriname; Sweden; Switzerland",
        "T: Taipei; Tajikistan; Tanzania; Thailand; Timor-Leste; Togo; Tonga; Trinidad and Tobago; Tunisia; Turkiye",
        "U: Uganda; Ukraine; United Arab Emirates; United Kingdom; United States; Uruguay",
        "V: Vanuatu; Venezuela, Bolivarian Republic of; Viet Nam",
        "Y: Yemen",
        "Z: Zambia; Zimbabwe",
        "나. 편익관세 적용대상국가 (15개국, 아래 편익관세 참조)",
        "다. 쌍무협정에 규정된 최혜국 조항 적용국 (국가간 개별 협정에 따라 최혜국 조항이 적용되는 경우로써, 적용국이 특게되어 있지 않음)",
        "수단, 우즈베키스탄, 이디오피아, 벨라루스 등",
      ],
    },
    {
      title: "4. 농림축산물에 대한 양허세율의 적용신청 (관세법시행령 제94조)",
      lines: [
        "국내외 가격차에 상당한 율로 양허하거나 국내시장 개방과 함께 기본세율보다 높은 세율로 양허한 농림축산물을 시장접근물량 이내로 수입하는 자로서 관련기관의 추천을 받은 자는 해당 추천서를 수입신고 수리 전까지 세관장에게 제출해야 한다. 다만, 해당 농림축산물이 보세구역에서 반출되지 않은 경우에는 수입신고 수리일부터 15일이 되는 날까지 제출할 수 있다.",
      ],
    },
    {
      title: "5. 편익관세 (관세법 제74조)",
      lines: [
        "가. 관세에 관한 조약에 따른 편익을 받지 아니하는 나라의 생산물로서 우리나라에 수입되는 물품에 대하여 이미 체결된 외국과의 조약에 따른 편익의 한도에서 관세에 관한 편익을 부여하는 관세제도",
        "나. 적용대상국가 (15개국, 관세법시행령 제95조)",
      ],
      table: {
        columns: ["지역", "국가"],
        rows: [
          ["1. 아시아", "부탄"],
          ["2. 중동", "이란·이라크·레바논·시리아"],
          ["3. 대양주", "나우르"],
          ["4. 아프리카", "에디오피아·리베리아·소말리아"],
          ["5. 유럽", "안도라·모나코·산마리노·바티칸·덴마크(그린란드 및 페로제도에 한정한다)"],
        ],
      },
      afterLines: ["다. 세율적용 우선순위 : WTO 일반양허관세와 동일"],
    },
    {
      title: "6. 관세율 부호설명",
      lines: [],
      table: {
        columns: ["부호", "설명"],
        rows: [
          ["C", "[공산품·수산물 및 단순 양허한 농림축산물에 대한 양허관세] 중 하나의 품목에 하나의 세율이 적용되는 경우"],
          [
            "C1, C3~C6",
            "[공산품·수산물 및 단순 양허한 농림축산물에 대한 양허관세] 중 하나의 품목에 서로 다른 협정세율이 있는 경우 최고세율인 C를 제외하고 세율이 높은 순으로 C1, C3~C6까지 순차 적용",
          ],
          [
            "C2, C2A1~8",
            "[공산품·수산물 및 단순 양허한 농림축산물에 대한 양허관세] 중 임의로 선택 가능한 두 개의 세율이 있는 경우",
          ],
          ["W1", "시장접근물량이 설정된 농림축산물에 대한 양허관세 중 추천기관의 추천을 받은 경우"],
          ["W2", "시장접근물량이 설정된 농림축산물에 대한 양허관세 중 추천기관의 추천을 받지 못한 경우"],
          ["W3", "시장접근물량이 설정된 농림축산물에 대한 양허관세 중 시장접근물량 증량분에 해당하는 경우"],
        ],
      },
    },
    {
      title: "7. 관련기관",
      lines: ["기획재정부 다자관세팀 (Tel : 044-215-4467)"],
    },
  ];
}

function concessionSections(code: string): DutySection[] {
  if (code === "wto-tndc") {
    return [
      {
        title: "1. 적용법령",
        lines: ["세계무역기구협정등에 의한 양허관세규정 [대통령령 제35126호, 2024. 12. 31.]"],
      },
      {
        title: "2. 적용국가",
        lines: ["세계무역기구협정 개발도상국간의 무역협상에 관한 의정서에 의하여 동 의정서에 서명·가입한 국가"],
        table: {
          columns: ["지역", "국가"],
          rows: [
            ["아시아(3)", "방글라데시, 터키, 파키스탄, 필리핀"],
            ["아메리카(5)", "멕시코, 브라질, 우루과이, 칠레, 페루, 파라과이"],
            ["중동(2)", "이스라엘, 이집트"],
            ["아프리카(1)", "튀니지"],
            ["유럽(1)", "세르비아"],
          ],
        },
      },
      {
        title: "3. 적용세율",
        lines: ["세계무역기구협정 등에 의한 양허관세규정 [별표2] 세계무역기구협정 개발도상국간의 양허관세(제3조 관련)"],
      },
      {
        title: "4. 적용요건",
        lines: [
          "수입신고 하는 때에 GATT 원산지증명서(TNDC)를 제출하여야 함 (사본제출 가능) (관세법시행령 제236조, 고시 제5조)",
        ],
      },
      {
        title: "5. 원산지결정기준",
        lines: [
          "가. 완전생산기준(P) : 수출물품의 전부를 원산지국에서 생산한 경우",
          "나. 부가가치기준(Y) : 부가가치기준인 경우 원산지결정기준 'Y' 표기 다음 해당물품의 생산에 사용된 비원산지재료의 비율을 표기함. 비원산지재료의 비율이 50% 미만인 경우 특혜관세를 적용 받을 수 있음. (예: Y less than 50%)",
          "다. 세번변경기준(X) : 세번변경기준인 경우 원산지결정기준 'X' 표기 다음 해당 HS의 4단위 호를 기재함. (예: X 97.06)",
          "라. 두가지 기준 동시 충족시 : 두가지 기준을 모두 표기. (예 : X 84.05, Y less than 40%)",
        ],
      },
      { title: "6. 세계무역기구협정 개발도상국간의 양허관세", lines: ["아래 품목표 참조"] },
    ];
  }
  if (code === "wto-apta") {
    return [
      {
        title: "1. 적용법령",
        lines: [
          "세계무역기구협정등에 의한 양허관세규정 [대통령령 제35126호, 2024. 12. 31.]",
          "아시아·태평양 무역협정 [조약 제1802호, 2006. 8. 24.]",
          "아시아·태평양 무역협정에 대한 제2차 개정 [조약 제2389호, 2018. 6. 29.]",
          "아시아-태평양 무역협정에 의한 물품의 원산지 증명 및 검증 운영절차 [아시아 태평양 경제사회 이사회, 2005. 11. 2.]",
          "아시아·태평양 무역협정 원산지 확인 기준 등에 관한 규칙 [기획재정부령 제681호, 2018. 6. 12.]",
          "APTA 직접운송원칙 입증서류관련 지침 [관세청지침, 2013. 7. 5.]",
          "APTA 직접운송원칙 입증서류관련 추가지침 [관세청지침, 2013. 7. 26.]",
        ],
      },
      {
        title: "2. 적용국가",
        lines: [
          "아시아·태평양 무역협정에 의하여 동 협정에 서명·가입한 국가",
          "가. 한국, 중국(홍콩, 마카오 제외), 인도, 스리랑카, 방글라데시, 라오스",
          "나. 몽골(2020. 1. 1. 발효) - E1 세율 적용",
        ],
      },
      {
        title: "3. 세율구분 (세계무역기구협정등에 의한 양허관세규정)",
        lines: [],
        table: {
          columns: ["구분", "부호", "참조"],
          rows: [
            ["일반", "E1", "규정 별표3의 가, 별표3의 나 중 하나의 세번에 하나의 세율이 있는 경우"],
            ["일반", "E1A1 ~ E1A10", "규정 별표3의 가 중 하나의 세번에 여러 세율이 있는 경우 높은 세율부터 E1A1, E1A2 ... 순서로 적용"],
            ["일반", "E1B1~E1B4", "규정 별표3가 중 종가세 또는 종량세를 선택할 수 있는 물품"],
            ["방글라데시", "E2", "규정 별표3의 다 중 하나의 세번에 하나의 세율이 있는 경우"],
            ["방글라데시", "E2A1, E2A2", "규정 별표3의 다 중 하나의 세번에 여러 세율이 있는 경우 높은 세율부터 E2A1, E2A2 순서로 적용"],
            ["방글라데시", "E2A3", "규정 별표3의 다 중 물량기준 제한이 있는 물품"],
            ["라오스", "E3", "규정 별표3의 라 중 하나의 세번에 하나의 세율이 있는 경우"],
            ["라오스", "E3A1, E3A2", "규정 별표3의 라 중 하나의 세번에 여러 세율이 있는 경우 높은 세율부터 E3A1, E3A2 순서로 적용"],
            ["라오스", "E3A3", "규정 별표3의 라 중 물량기준 제한이 있는 물품"],
          ],
        },
      },
      {
        title: "4. 원산지규정",
        lines: [
          "가. 수입신고 하는 때에 APTA 원산지증명서를 제출하여야 함 (사본제출 가능) (관세법시행령 제236조, 고시 제5조)",
          "※ 전자 원산지증명시스템을 통해 원산지증명서 내용을 확인할 수 있는 경우 원산지증명서 제출 생략 (중국)",
          "나. 원산지결정기준",
          "(1) 완전생산기준(A) : 수출참가국에서 완전히 생산되거나 획득된 물품",
          "(2) 원산국부가가치기준(B) : 비원산지재료의 비율이 FOB의 100분의 55 이하 (B 55% 이하)",
          "(3) 역내누적부가가치기준(C) : 역내 부가가치가 FOB의 100분의 60 이상 (C 60% 이상)",
          "(4) 최빈국(방글라데시, 라오스) 특례(D) : 원산국부가가치기준(D 35% 이상), 역내누적부가가치기준(D 50% 이상)",
          "(5) 품목별 원산지기준(E) : 별표의 품목별 원산지 기준을 충족하는 물품 (E CTH)",
        ],
      },
    ];
  }
  if (code === "wto-gstp") {
    return [
      {
        title: "1. 적용법령",
        lines: [
          "GSTP원산지규정 [GSTP협정 부속서Ⅱ, 1989. 6. 11.]",
          "세계무역기구협정등에 의한 양허관세규정 [대통령령 제35126호, 2024. 12. 31.]",
        ],
      },
      {
        title: "2. 적용국가 (UNCTAD 개발도상국간 특혜무역제도에 관한 협정에 서명·가입한 국가)",
        lines: ["(※ 표시는 최빈국으로서 G2세율이 적용됨)"],
        table: {
          columns: ["지역", "국가"],
          rows: [
            ["아시아(12)", "파키스탄, 베트남, 싱가포르, 인도, 인도네시아, 말레이시아, 스리랑카, 북한, 태국, 필리핀, 미얀마※, 방글라데시※"],
            ["아메리카(15)", "페루, 쿠바, 니카라구아, 멕시코, 가이아나, 에콰도르, 볼리비아, 칠레, 트리니다드토바고, 아르헨티나, 브라질, 콜롬비아, 베네주엘라, 우루과이, 파라과이"],
            ["아프리카(13)", "짐바브웨, 가나, 알제리아, 리비아, 나이지리아, 카메룬, 모로코, 튀니지아, 수단※, 기네아※, 베닌※, 모잠비크※, 탄자니아※"],
            ["중동(3)", "이라크, 이집트, 이란"],
          ],
        },
      },
      {
        title: "3. 적용요건",
        lines: [
          "수입신고 하는 때에 개발도상국간의 특혜무역제도(GSTP) 원산지증명서를 제출하여야 함 (사본제출 가능) (관세법시행령 제236조, 고시 제5조)",
          "- 원산지결정기준 : 완전생산기준(A), 원산국부가가치기준(B 50%↓), 역내누적부가가치기준(C 60%↑)",
          "- 최빈국에 대한 원산지결정기준의 특례 : 원산국부가가치기준(D 40%↓), 역내누적부가가치기준(D 50%↑)",
        ],
      },
      { title: "5. 적용물품 및 세율", lines: ["아래 품목표 참조 (부호 G1, G2)"] },
    ];
  }
  if (code === "wto-coop") {
    return [
      {
        title: "1. 적용법령",
        lines: [
          "관세법 제73조, 특정국가와의 관세협상에 따른 국제협력관세의 적용에 관한 규정 [대통령령 제35128호, 2024. 12. 31.]",
        ],
      },
      { title: "2. 적용국가", lines: ["전세계"] },
      {
        title: "3. 적용대상 물품 및 세율",
        lines: [
          "국제협력관세의 적용대상 물품 및 세율",
          "※ 적용대상 물품의 품명이 HSK 표준품명과 다른 경우가 있으므로 해당 품명을 반드시 확인하시기 바랍니다.",
        ],
      },
      {
        title: "4. 세율 적용의 우선순위 (관세법 제50조)",
        lines: ["기본, 잠정, 특혜, 조정, 할당관세 보다 세율이 낮은 경우에 한하여 우선 적용"],
      },
      { title: "5. 관련기관", lines: ["기획재정부 다자관세팀 (Tel : 044-215-4467)"] },
    ];
  }
  if (code === "wto-ldc") {
    return [
      {
        title: "1. 적용법령",
        lines: [
          "가. 최빈개발도상국에 대한 특혜관세 공여규정 [대통령령 제35365호, 2025. 2. 28.]",
          "나. 원산지표시제도 운영에 관한 고시 [관세청고시]",
          "다. 특혜관세 적용 및 원산지증명 제도 운영에 관한 고시 [관세청고시]",
        ],
      },
      {
        title: "2. 적용국가 <개정 2025. 4. 1.>",
        lines: [],
        table: {
          columns: ["지역", "국가"],
          rows: [
            ["아시아", "네팔*, 동티모르, 라오스*, 미얀마, 방글라데시*, 부탄*, 아프가니스탄, 예멘, 캄보디아*"],
            ["오세아니아", "솔로몬제도*, 키리바시, 투발루"],
            ["아프리카", "감비아, 기니, 기니비사우, 남수단, 니제르, 라이베리아, 레소토, 르완다, 마다가스카르, 말라위, 말리, 모리타니, 모잠비크, 베냉, 부룬디, 부르키나파소, 상투메프린시페*, 세네갈*, 소말리아, 수단, 시에라리온, 앙골라, 에리트레아, 에티오피아, 우간다, 잠비아, 중앙아프리카공화국, 지부티, 차드, 코모로, 콩고민주공화국, 탄자니아, 토고"],
            ["아메리카", "아이티"],
          ],
        },
        afterLines: [
          "※ 비고",
          "가. 네팔, 라오스 및 방글라데시에 대한 특혜관세는 2029년 11월 23일까지 수입신고하는 물품에 대해 적용한다.",
          "나. 솔로몬제도에 대한 특혜관세는 2030년 12월 13일까지 수입신고하는 물품에 대해 적용한다.",
          "다. 상투메프린시페에 대한 특혜관세는 2025년 4월 1일부터 2027년 12월 12일까지 수입신고하는 물품에 대해 적용한다.",
          "라. 부탄에 대한 특혜관세는 2025년 4월 1일부터 2026년 12월 12일까지 수입신고하는 물품에 대해 적용한다.",
          "마. 캄보디아 및 세네갈에 대한 특혜관세는 2032년 12월 18일까지 수입신고하는 물품에 대해 적용한다.",
        ],
      },
      {
        title: "3. 원산지규정",
        lines: [
          "가. 수입신고 하는 때에 원산지증명서를 제출하여야 함 (사본제출 가능) (관세법시행령 제236조, 고시 제5조)",
          "(1) 최빈개발도상국에대한특혜관세공여규정에 따른 원산지증명서",
          "(2) 특혜관세 적용 및 원산지증명 제도 운영에 관한 고시에 따른 원산지증명서",
          "나. 원산지증명서의 원산지결정기준 (규정 제5조)",
          "(1) 완전생산기준(A)",
          "(2) 부가가치기준(B 60% 이하) : 비원산지재료의 가격이 최종생산물의 본선인도가격의 100분의 60 이하",
        ],
      },
    ];
  }
  return [];
}

function provisionalSections(): DutySection[] {
  return [
    {
      title: "1. 적용법령",
      lines: ["관세법 제49조, 제50조, 관세법시행령 제57조"],
    },
    {
      title: "2. 세율적용의 우선순위",
      lines: [
        "기본세율에 우선하여 적용(잠정세율의 적용을 받는 물품에 대하여는 대통령령이 정하는 바에 의하여 그 물품의 전부 또는 일부에 대하여 잠정세율의 적용을 정지하거나 기본세율과의 세율차를 좁히도록 잠정세율을 인상하거나 인하할 수 있다.)",
      ],
    },
    {
      title: "[별표] 관세율표 중 잠정세율 대상물품 (적용시한 : 2006. 12. 30.)",
      lines: [],
    },
  ];
}

function buildProvisional(): { columns: string[]; rows: DutyRow[] } {
  const rows = (provisionalCiel as { hs1: string; hs2: string; hs3: string; name: string; rate: string }[]).map(
    (row) => ({
      hs1: row.hs1,
      hs2: row.hs2,
      hs3: row.hs3,
      품명: row.name.replace(/\s+/g, " ").trim(),
      세율: row.rate,
      HSK: [row.hs1, row.hs2, row.hs3].filter(Boolean).join(" "),
    }),
  );
  return { columns: ["HSK", "품명", "세율"], rows };
}

function ssgSections(): { title: string; lines: string[] }[] {
  return [
    {
      title: "1. 적용법령",
      lines: [
        "관세법 제68조, 관세법시행령 제90조",
        "관세법 제68조에 따른 특별긴급관세 부과에 관한 규칙 [기획재정부령 제1154호, 2025. 12. 31.]",
      ],
    },
    {
      title: "2. 적용세율",
      lines: [
        "가. 물량기준 (T1)",
        "당해 연도 수입량의 누계가 기준발동물량 초과시 부과 (관세청장이 특별긴급관세가 부과됨을 관보 또는 일간신문 등에 공고)",
        "나. 가격기준 (T2)",
        "(1) 부과시기 : 수입 물품의 CIF수입가격이 기준가격보다 10% 초과 하락하여 수입신고 되는 때 부과",
        "(2) 기준가격에 의한 세액 산출 방법 (관세법시행령 제90조)",
        "(가) 수입가격하락율 = (기준가격 - 수입가격)/기준가격",
        "(나) 수입가격하락율에 따른 특별긴급관세액 [수입가격하락율(R) , 기준가격(S), 수입가격(P)]",
        "① 10% < R ≤ 40% : S × (R - 10%) × 30%",
        "② 40% < R ≤ 60% : S × [9% + (R - 40%) × 50%]",
        "③ 60% < R ≤ 75% : S × [19% + (R - 60%) × 70%]",
        "④ 75% < R : S × [29.5% + (R - 75%) × 90%]",
        "(다) 가격기준에 의하여 부과되는 관세 = 시장접근물량초과관세율(W2)에 의한 관세 + 기준가격에 의하여 산출된 특별긴급관세",
        "다. 가격기준과 물량기준이 경합 시 높은 세액 우선 적용",
      ],
    },
    {
      title: "3. 세계무역기구협정등에의한양허관세규정 별표1의나 세율과의 관계",
      lines: [
        "가. 시장접근물량 이내(관련기관의 추천을 받은 경우) : 시장접근물량이내의 낮은 세율 적용",
        "나. 시장접근물량 초과(추천을 받지 아니한 경우) : 시장접근물량초과의 높은 세율 적용",
        "다. 특별긴급관세 기준발동물량 초과(추천을 받은 경우는 특별긴급관세 부과대상에서 제외하며, 수입량의 누계를 계산할 때에는 WTO협정 별표 1의 나의 양허된 시장접근물량은 이미 수입된 것으로 본다) : 특별긴급관세 적용",
      ],
    },
    {
      title: "4. 미국 및 중국과의 협정에 따른 특별긴급관세 부과대상 및 제외대상 물품 (FTA관세법시행규칙 제27조)",
      lines: [
        "가. 미국을 원산지로 하는 농림축산물 중 특별긴급관세 부과대상 물품 (그 밖의 물품은 특별긴급관세 부과 제외)",
        "나. 중국을 원산지로 하는 농림축산물 중 특별긴급관세 부과대상에서 제외하는 물품",
      ],
    },
    {
      title: "5. 관련기관",
      lines: ["기획재정부 세제실 산업관세과 (Tel : 044-215-4431)"],
    },
    {
      title: "6. 세율 및 기준가격 (적용기간 : 2026. 1. 1. ~ 2026. 12. 31.)",
      lines: [],
    },
  ];
}

/** CIEL T.asp 2026: rice trigger quantity is not stored in clip_tariff_rate. */
const SSG_RICE_TRIGGER = "507,279톤";
/** CIEL shows volume-based rate (T1) in 세율; 부과 stays blank. T2 W2 rates are not shown there. */
const SSG_RICE_RATE = "684%";

function formatSsgPrice(raw: string): string {
  const n = Number(String(raw).replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return "";
  return `${n.toLocaleString("ko-KR")}원/kg`;
}

async function buildSsg(db: SmartLawDb): Promise<{ columns: string[]; rows: DutyRow[] }> {
  const t1 = new Map<string, { hs: string; name: string; rate: string }>();
  const t2 = new Map<string, { hs: string; name: string; price: string }>();
  const t1Rows = (await db.all(`SELECT hs_code AS hs, hs_code_display AS display, item_name AS name, tariff_rate AS rate
         FROM clip_tariff_rate WHERE category_symbol = 'T1'`)) as Record<string, unknown>[];
  for (const row of t1Rows) {
    const hs = String(row.hs ?? "");
    t1.set(hs, { hs: String(row.display ?? hs), name: String(row.name ?? ""), rate: String(row.rate ?? "") });
  }
  const t2Rows = (await db.all(`SELECT hs_code AS hs, hs_code_display AS display, item_name AS name, base_price AS price
         FROM clip_tariff_rate WHERE category_symbol = 'T2'`)) as Record<string, unknown>[];
  for (const row of t2Rows) {
    const hs = String(row.hs ?? "");
    t2.set(hs, {
      hs: String(row.display ?? hs),
      name: String(row.name ?? ""),
      price: String(row.price ?? "").trim(),
    });
  }
  const codes = [...new Set([...t1.keys(), ...t2.keys()])].sort();
  return {
    columns: ["HSK", "품명", "기준발동물량", "부과", "세율", "기준가격"],
    rows: codes.map((code) => {
      const volume = t1.get(code);
      const price = t2.get(code);
      const rate = volume ? volume.rate || SSG_RICE_RATE : "";
      return {
        HSK: volume?.hs || price?.hs || code,
        품명: volume?.name || price?.name || "",
        기준발동물량: volume ? SSG_RICE_TRIGGER : "",
        부과: "",
        세율: rate,
        기준가격: formatSsgPrice(price?.price ?? ""),
      };
    }),
  };
}

async function clause(db: SmartLawDb, lawId: string, title: string, mark: string): Promise<string> {
  const law = await db.get(`SELECT id FROM laws WHERE law_id = ?`, [lawId]) as { id?: number } | undefined;
  if (!law?.id) return "";
  const ver = await db.get(`SELECT id FROM law_versions WHERE law_id = ? AND is_current = 1`, [law.id]) as { id?: number } | undefined;
  if (!ver?.id) return "";
  const article = await db.get(`SELECT id FROM law_articles WHERE law_version_id = ? AND article_type = '조문' AND article_title = ? LIMIT 1`, [ver.id, title]) as { id?: number } | undefined;
  if (!article?.id) return "";
  const items = (await db.all(`SELECT item_content AS text FROM law_article_items WHERE law_article_id = ? ORDER BY display_order, id`, [article.id])) as { text?: string }[];
  const hit = items.find((item) => String(item.text ?? "").trim().startsWith(mark));
  return hit ? String(hit.text).trim() : "";
}

async function buildPriority(db: SmartLawDb): Promise<{ rows: DutyRow[]; notes: { heading: string; text: string }[] }> {
  const base = await clause(db, "001556", "세율 적용의 우선순위", "①");
  const noteTexts = await Promise.all([
    clause(db, "001556", "세율 적용의 우선순위", "③"),
    clause(db, "001556", "세율 적용의 우선순위", "④"),
    clause(db, "001556", "세율 적용의 우선순위", "⑤"),
    clause(db, "010097", "세율 적용의 우선순위", "①"),
    clause(db, "010097", "세율 적용의 우선순위", "②"),
  ]);
  const notes = [
    { heading: "관세법 제50조", text: noteTexts[0] },
    { heading: "관세법 제50조", text: noteTexts[1] },
    { heading: "관세법 제50조", text: noteTexts[2] },
    { heading: "FTA관세특례법 제5조", text: noteTexts[3] },
    { heading: "FTA관세특례법 제5조", text: noteTexts[4] },
  ].filter((note) => note.text);
  if (!base) return { rows: [], notes };
  return {
    rows: [
      {
        순위: "1",
        세율: "덤핑방지관세(제51조), 상계관세(제57조), 보복관세(제63조), 긴급관세(제65조), 특정국물품 긴급관세(제67조의2), 특별긴급관세(제68조), 조정관세(제69조제2호)",
        적용: "별표 관세율표의 세율보다 우선합니다. 협정관세보다도 우선합니다.",
      },
      {
        순위: "2",
        세율: "국제협력관세(제73조), 편익관세(제74조)",
        적용: "기본세율, 잠정세율, 제3호와 제4호 세율보다 낮은 경우에만 우선합니다.",
      },
      {
        순위: "3",
        세율: "조정관세(제69조제1호·제3호·제4호), 할당관세(제71조), 계절관세(제72조)",
        적용: "할당관세는 제4호 세율보다 낮은 경우에만 우선합니다.",
      },
      {
        순위: "4",
        세율: "일반특혜관세(제76조)",
        적용: "제2호 세율은 이 세율보다 낮은 경우에만 우선합니다.",
      },
      {
        순위: "잠정",
        세율: "잠정세율",
        적용: "기본세율보다 우선합니다.",
      },
      {
        순위: "기본",
        세율: "기본세율",
        적용: "별표 관세율표에 따릅니다.",
      },
    ],
    notes,
  };
}

async function kindRows(db: SmartLawDb): Promise<DutyKindRow[]> {
  const out: DutyKindRow[] = [];
  for (const spec of KIND_SPEC) {
    let stored = "";
    if (spec.code) {
      const found = await db.get(
        `SELECT Gwanse_semyung AS name FROM bgwanse WHERE Gwanse_code = ?`,
        [spec.code],
      );
      stored = String(found?.name ?? "").trim();
    }
    const missing = Boolean(spec.code) && !stored;
    out.push({
      group: spec.group,
      name: spec.name || stored || spec.fallback,
      detail: spec.detail ?? "",
      condition: spec.condition ?? "",
      symbol: spec.code,
      law: spec.law,
      href: spec.href ?? "",
      missing,
    });
  }
  return out;
}
