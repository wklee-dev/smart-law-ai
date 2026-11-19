import { defaultCountry, defaultYear } from "@/hanjoo/lib/paths";
import { openSmartLawDb, smartLawTableExists, type SmartLawDb } from "@/hanjoo/lib/smart-law-db";

export type TariffChapter = {
  section_code: string;
  section_name: string;
  chapter_code: string;
  chapter_name: string;
  chapter_name_en: string;
};

export type TariffTreeNode = {
  code: string;
  name: string;
  name_en: string;
  level: "heading" | "item";
  hs_code?: string;
};

export type TariffItem = {
  year: number;
  country_code: string;
  country_name: string;
  section_code: string;
  chapter_code: string;
  heading_code: string;
  hs_code: string;
  item_name: string;
  item_name_en: string;
  basic_rate: string;
  elastic_rate: string;
  elastic_codes: string;
  elastic_rates: string;
  simple_refund: string;
  reduction: string;
  origin: string;
  unit_weight: string;
  unit_qty: string;
};

export type TariffHeading = {
  heading_code: string;
  heading_name: string;
  heading_name_en: string;
};

export type HeadingNode = {
  hs_code: string;
  suffix: string;
  depth: number;
  item_name: string;
  item_name_en: string;
  basic_rate: string;
  elastic_rate: string;
  leaf: boolean;
  has_import: boolean;
  has_export: boolean;
};

export type TariffRate = {
  rate_code: string;
  rate_value: string;
  rate_name: string;
};

export type TariffReq = {
  req_type: string;
  req_category: string;
  req_content: string;
};

export type TariffStrategic = {
  cls_no: string;
  item_name: string;
  ctrl_name: string;
  model_spec: string;
  ctrl_detail: string;
  manufacturer: string;
  remark: string;
};

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function openTariffDb(readOnly = true): Promise<SmartLawDb> {
  return openSmartLawDb(readOnly);
}

export function normalizeHsDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function formatHsDisp(code: string): string {
  const d = normalizeHsDigits(code);
  if (d.length < 4) return code;
  if (d.length <= 6) return `${d.slice(0, 4)}.${d.slice(4)}`;
  return `${d.slice(0, 4)}.${d.slice(4, 6)}-${d.slice(6)}`;
}

export async function listChapters(
  db: SmartLawDb,
  year = defaultYear(),
  country = defaultCountry(),
): Promise<TariffChapter[]> {
  const rows = await db.all(
    `SELECT section_code, section_name, chapter_code, chapter_name, chapter_name_en
       FROM tariff_chapter
      WHERE country_code = ? AND year = ?
      ORDER BY CAST(section_code AS INTEGER), CAST(chapter_code AS INTEGER)`,
    [country, year],
  );
  return rows.map((r) => ({
    section_code: str(r.section_code).padStart(2, "0"),
    section_name: str(r.section_name),
    chapter_code: str(r.chapter_code).padStart(2, "0"),
    chapter_name: str(r.chapter_name),
    chapter_name_en: str(r.chapter_name_en),
  }));
}

export type ForeignTariffCountry = {
  code: string;
  name: string;
  years: number[];
};

export async function listForeignCountries(db: SmartLawDb): Promise<ForeignTariffCountry[]> {
  const rows = await db.all(
    `SELECT UPPER(TRIM(country_code)) AS code,
            MAX(TRIM(IFNULL(country_name, ''))) AS name
       FROM tariff_section
      WHERE TRIM(IFNULL(country_code, '')) != ''
        AND UPPER(TRIM(country_code)) != 'KR'
      GROUP BY UPPER(TRIM(country_code))`,
  );

  const out: ForeignTariffCountry[] = [];
  for (const r of rows) {
    const code = str(r.code).toUpperCase();
    const name = str(r.name) || code;
    const yearRows = await db.all(
      `SELECT DISTINCT CAST(year AS INTEGER) AS year
         FROM tariff_section
        WHERE UPPER(TRIM(country_code)) = ?
          AND year IS NOT NULL`,
      [code],
    );
    const years = yearRows
      .map((y) => num(y.year))
      .filter((y) => y > 0)
      .sort((a, b) => b - a);
    if (years.length) out.push({ code, name, years });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

export async function listTreeByPrefix(
  db: SmartLawDb,
  prefix: string,
  year = defaultYear(),
  country = defaultCountry(),
): Promise<TariffTreeNode[]> {
  const p = normalizeHsDigits(prefix).slice(0, 4);
  if (!p) return [];

  const headingRows = await db.all(
    `SELECT heading_code, heading_name, heading_name_en
       FROM tariff_heading
      WHERE country_code = ? AND year = ?
        AND (heading_code LIKE ? OR chapter_code = ?)
      ORDER BY heading_code
      LIMIT 200`,
    [country, year, `${p}%`, p.slice(0, 2).padStart(2, "0")],
  );
  const headings = headingRows.map((r) => ({
    code: str(r.heading_code),
    name: str(r.heading_name),
    name_en: str(r.heading_name_en),
    level: "heading" as const,
  }));

  const itemRows = await db.all(
    `SELECT hs_code, item_name, item_name_en, heading_code
       FROM tariff_item
      WHERE country_code = ? AND year = ?
        AND (hs_code LIKE ? OR heading_code LIKE ?)
      ORDER BY hs_code
      LIMIT 500`,
    [country, year, `${p}%`, `${p}%`],
  );
  const items = itemRows.map((r) => ({
    code: str(r.hs_code),
    name: str(r.item_name),
    name_en: str(r.item_name_en),
    level: "item" as const,
    hs_code: str(r.hs_code),
  }));

  const out: TariffTreeNode[] = [];
  const seen = new Set<string>();
  for (const h of headings) {
    if (seen.has(h.code)) continue;
    seen.add(h.code);
    out.push(h);
  }
  for (const it of items) {
    if (seen.has(it.code)) continue;
    seen.add(it.code);
    out.push(it);
  }
  return out;
}

export async function getItem(
  db: SmartLawDb,
  hsCode: string,
  year = defaultYear(),
  country = defaultCountry(),
): Promise<TariffItem | null> {
  const digits = normalizeHsDigits(hsCode);
  if (!digits) return null;
  const selectCols = `year, country_code, country_name, section_code, chapter_code,
              heading_code, hs_code, item_name, item_name_en, basic_rate, elastic_rate,
              elastic_codes, elastic_rates, simple_refund, reduction, origin,
              unit_weight, unit_qty`;
  let row = await db.get(
    `SELECT ${selectCols}
         FROM tariff_item
        WHERE country_code = ? AND year = ? AND replace(replace(hs_code,'.',''),'-','') = ?
        LIMIT 1`,
    [country, year, digits],
  );
  if (!row) {
    const likeRows = (await db.all(
      `SELECT ${selectCols}
         FROM tariff_item
        WHERE country_code = ? AND year = ? AND hs_code LIKE ?`,
      [country, year, `${digits}%`],
    )) as Record<string, unknown>[];
    row =
      likeRows
        .slice()
        .sort(
          (a, b) =>
            String(b.hs_code ?? "").replace(/[.\-]/g, "").length -
            String(a.hs_code ?? "").replace(/[.\-]/g, "").length,
        )[0] ?? undefined;
  }

  if (!row) return null;
  return {
    year: num(row.year),
    country_code: str(row.country_code),
    country_name: str(row.country_name),
    section_code: str(row.section_code),
    chapter_code: str(row.chapter_code),
    heading_code: str(row.heading_code),
    hs_code: str(row.hs_code),
    item_name: str(row.item_name),
    item_name_en: str(row.item_name_en),
    basic_rate: str(row.basic_rate),
    elastic_rate: str(row.elastic_rate),
    elastic_codes: str(row.elastic_codes),
    elastic_rates: str(row.elastic_rates),
    simple_refund: str(row.simple_refund),
    reduction: str(row.reduction),
    origin: str(row.origin),
    unit_weight: str(row.unit_weight),
    unit_qty: str(row.unit_qty),
  };
}

export async function listHeadings(
  db: SmartLawDb,
  chapterCode: string,
  year = defaultYear(),
  country = defaultCountry(),
): Promise<TariffHeading[]> {
  const ch = normalizeHsDigits(chapterCode).slice(0, 2);
  if (!ch) return [];
  const rows = await db.all(
    `SELECT heading_code, heading_name, heading_name_en
       FROM tariff_heading
      WHERE country_code = ? AND year = ?
        AND CAST(chapter_code AS INTEGER) = ?
      ORDER BY heading_code`,
    [country, year, Number(ch)],
  );
  return rows.map((r) => ({
    heading_code: str(r.heading_code),
    heading_name: str(r.heading_name),
    heading_name_en: str(r.heading_name_en),
  }));
}

export async function listHeadingNodes(
  db: SmartLawDb,
  headingCode: string,
  year = defaultYear(),
  country = defaultCountry(),
): Promise<HeadingNode[]> {
  const h = normalizeHsDigits(headingCode).slice(0, 4);
  if (h.length < 4) return [];
  const itemRows = await db.all(
    `SELECT hs_code, item_name, item_name_en, basic_rate, elastic_rate
       FROM tariff_item
      WHERE country_code = ? AND year = ? AND heading_code = ?
      ORDER BY hs_code
      LIMIT 1500`,
    [country, year, h],
  );
  const rows = itemRows.map((r) => ({
    hs_code: normalizeHsDigits(str(r.hs_code)),
    item_name: str(r.item_name),
    item_name_en: str(r.item_name_en),
    basic_rate: str(r.basic_rate),
    elastic_rate: str(r.elastic_rate),
  }));

  const flags = new Map<string, { imp: boolean; exp: boolean }>();
  const reqRows = await db.all(
    `SELECT hs_code AS hs, req_type, req_content
       FROM tariff_req_condition
      WHERE country_code = ? AND year = ? AND hs_code LIKE ?`,
    [country, year, `${h}%`],
  );
  for (const r of reqRows) {
    const hs = normalizeHsDigits(str(r.hs));
    const cur = flags.get(hs) ?? { imp: false, exp: false };
    const content = str(r.req_content);
    if (!content) {
      flags.set(hs, cur);
      continue;
    }
    const t = str(r.req_type);
    if (/수입|import/i.test(t)) cur.imp = true;
    else if (/수출|export/i.test(t)) cur.exp = true;
    flags.set(hs, cur);
  }

  const set = new Set(rows.map((r) => r.hs_code));
  const hasChild = new Set<string>();
  for (const code of set) {
    for (let i = code.length - 1; i >= 4; i--) {
      const p = code.slice(0, i);
      if (set.has(p)) hasChild.add(p);
    }
  }

  return rows.map((r) => {
    const d = r.hs_code;
    let parent = "";
    for (let i = d.length - 1; i >= 4; i--) {
      const p = d.slice(0, i);
      if (set.has(p)) {
        parent = p;
        break;
      }
    }
    let depth = 0;
    for (let i = d.length - 1; i >= 4; i--) {
      if (set.has(d.slice(0, i))) depth += 1;
    }
    const flag = flags.get(d);
    return {
      hs_code: d,
      suffix: parent ? d.slice(parent.length) : d,
      depth,
      item_name: r.item_name,
      item_name_en: r.item_name_en,
      basic_rate: r.basic_rate,
      elastic_rate: r.elastic_rate,
      leaf: !hasChild.has(d),
      has_import: Boolean(flag?.imp),
      has_export: Boolean(flag?.exp),
    };
  });
}

export type DomesticTaxRecord = {
  category: string;
  rate: string;
  code: string;
  basePrice: string;
  ruralYn: string;
  period: string;
};

export async function listDomesticTax(
  db: SmartLawDb,
  hsCode: string,
  year = defaultYear(),
  country = defaultCountry(),
): Promise<DomesticTaxRecord[]> {
  if (!(await smartLawTableExists(db, "tariff_domestic_tax"))) return [];
  const digits = normalizeHsDigits(hsCode);
  const rows = await db.all(
    `SELECT tax_category, tax_rate, tax_code, taxable_base_price,
            rural_special_tax_yn, effective_period
       FROM tariff_domestic_tax
      WHERE country_code = ? AND year = ?
        AND (hs_code = ? OR replace(replace(hs_code,'.',''),'-','') = ?)
      ORDER BY tax_sequence`,
    [country, year, digits, digits],
  );
  return rows.map((r) => ({
    category: str(r.tax_category),
    rate: str(r.tax_rate),
    code: str(r.tax_code),
    basePrice: str(r.taxable_base_price),
    ruralYn: str(r.rural_special_tax_yn),
    period: str(r.effective_period),
  }));
}

export async function listRates(
  db: SmartLawDb,
  hsCode: string,
  year = defaultYear(),
  country = defaultCountry(),
): Promise<TariffRate[]> {
  const digits = normalizeHsDigits(hsCode);
  const item = await getItem(db, digits, year, country);
  const key = item?.hs_code || digits;
  const rows = await db.all(
    `SELECT rate_code, rate_value, rate_name
       FROM tariff_item_detail
      WHERE country_code = ? AND year = ?
        AND (hs_code = ? OR replace(replace(hs_code,'.',''),'-','') = ?)
      ORDER BY rate_code`,
    [country, year, key, digits],
  );
  return rows.map((r) => ({
    rate_code: str(r.rate_code),
    rate_value: str(r.rate_value),
    rate_name: str(r.rate_name),
  }));
}

export async function listReqs(
  db: SmartLawDb,
  hsCode: string,
  year = defaultYear(),
  country = defaultCountry(),
): Promise<TariffReq[]> {
  const digits = normalizeHsDigits(hsCode);
  const item = await getItem(db, digits, year, country);
  const key = item?.hs_code || digits;
  const rows = await db.all(
    `SELECT req_type, req_category, req_content
       FROM tariff_req_condition
      WHERE country_code = ? AND year = ?
        AND (hs_code = ? OR replace(replace(hs_code,'.',''),'-','') = ?)
      ORDER BY req_type, req_category
      LIMIT 200`,
    [country, year, key, digits],
  );
  return rows.map((r) => ({
    req_type: str(r.req_type),
    req_category: str(r.req_category),
    req_content: str(r.req_content),
  }));
}

export async function listStrategic(
  db: SmartLawDb,
  hsCode: string,
  year = defaultYear(),
  country = defaultCountry(),
): Promise<TariffStrategic[]> {
  const digits = normalizeHsDigits(hsCode);
  const item = await getItem(db, digits, year, country);
  const key = item?.hs_code || digits;
  const rows = await db.all(
    `SELECT cls_no, item_name, ctrl_name, model_spec, ctrl_detail, manufacturer, remark
       FROM tariff_req_strategic
      WHERE country_code = ? AND year = ?
        AND (hs_code = ? OR replace(replace(hs_code,'.',''),'-','') = ?)
      ORDER BY remark, item_name
      LIMIT 100`,
    [country, year, key, digits],
  );
  return rows.map((r) => ({
    cls_no: str(r.cls_no),
    item_name: str(r.item_name),
    ctrl_name: str(r.ctrl_name),
    model_spec: str(r.model_spec),
    ctrl_detail: str(r.ctrl_detail),
    manufacturer: str(r.manufacturer),
    remark: str(r.remark),
  }));
}

export async function breadcrumbMeta(
  db: SmartLawDb,
  item: TariffItem,
): Promise<{ section: string; chapter: string; heading: string }> {
  const sec = await db.get(
    `SELECT section_name FROM tariff_section
      WHERE country_code=? AND year=? AND section_code=? LIMIT 1`,
    [item.country_code, item.year, item.section_code],
  );
  const ch = await db.get(
    `SELECT chapter_name FROM tariff_chapter
      WHERE country_code=? AND year=? AND chapter_code=? LIMIT 1`,
    [item.country_code, item.year, item.chapter_code],
  );
  const hd = await db.get(
    `SELECT heading_name FROM tariff_heading
      WHERE country_code=? AND year=? AND heading_code=? LIMIT 1`,
    [item.country_code, item.year, item.heading_code],
  );
  return {
    section: str(sec?.section_name),
    chapter: str(ch?.chapter_name),
    heading: str(hd?.heading_name),
  };
}
