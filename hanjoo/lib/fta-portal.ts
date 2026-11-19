import {
  smartLawTableExists,
  withSmartLawDb,
  type SmartLawDb,
} from "@/hanjoo/lib/smart-law-db";
import { coFormOf, coSummary, type CoForm } from "@/hanjoo/lib/fta-co-codes";
import { learnOriginDetail, originDetailNote } from "@/hanjoo/lib/fta-origin-learn";
import { ftaTreatyPath } from "@/hanjoo/lib/fta-treaty";

/** 세율 국가코드 → 원산지결정기준 agreement_key */
const PSR_KEY: Record<string, string> = {
  CL: "cl",
  SG: "sg",
  NO: "ch",
  IS: "ch",
  CH: "ch",
  AS: "as2",
  IN: "in",
  EU: "eu",
  PE: "pe",
  US: "us",
  TR: "tr",
  AU: "au",
  CA: "ca",
  CN: "cn",
  NZ: "nz",
  VE: "vn",
  CO: "co",
  NI: "ni",
  HN: "ni",
  CR: "ni",
  SV: "ni",
  PA: "ni",
  GB: "gb",
  RA: "rc",
  RU: "rc",
  RC: "rc",
  RJ: "rc",
  RN: "rc",
  IL: "il",
  KH: "kh",
  ID: "id",
  PP: "ph",
  AE: "ae",
};

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function digits(v: string): string {
  return v.replace(/\D/g, "");
}


async function withDb<T>(fn: (db: SmartLawDb) => Promise<T>): Promise<T> {
  return withSmartLawDb(fn);
}


function pageOf(page?: number) {
  const pageSize = 20;
  const p = Math.max(Number(page) || 1, 1);
  return { page: p, pageSize, offset: (p - 1) * pageSize };
}

function formatRate(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (/%|면제|무세|종량|원\b/i.test(t)) return t;
  if (/^-?\d+(\.\d+)?$/.test(t)) return `${t}%`;
  return t;
}

export type FtaNation = {
  code: string;
  nameKo: string;
  nameEn: string;
  psrKey: string;
};

export type FtaChapter = { code: string; nameKo: string; nameEn: string };

export type FtaAgreementRow = {
  code: string;
  name: string;
  countries: string;
  certificate: string;
  criterion: string;
  effect: string;
  treatyUrl: string;
};

function bullets(raw: string): string {
  return raw
    .split(/\s*-\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n");
}

export async function listFtaAgreementOverview(): Promise<FtaAgreementRow[]> {
  return await withDb(async (db) => {
    if (!(await smartLawTableExists(db, "cl_fta_nation"))) return [];
    const rows = await db.all(`SELECT fta_cd, fta_nm, nation_nm, cert_desc, psr_desc, effect_dt, treaty_url
             FROM cl_fta_nation
            ORDER BY COALESCE(sort_no, 9999), fta_cd`);
    return Promise.all(rows.map(async (r) => ({
      code: str(r.fta_cd),
      name: str(r.fta_nm),
      countries: str(r.nation_nm),
      certificate: bullets(str(r.cert_desc)),
      criterion: bullets(str(r.psr_desc)),
      effect: str(r.effect_dt),
      treatyUrl: await ftaTreatyPath(db, str(r.fta_cd)),
    })));
  });
}

export type FtaGeneralSection = { heading: string; content: string };

export async function listFtaGeneralPrinciples(): Promise<FtaGeneralSection[]> {
  return await withDb(async (db) => {
    if (!(await smartLawTableExists(db, "cl_fta_general"))) return [];
    return (
      (await db.all(`SELECT gubun, content
             FROM cl_fta_general
            WHERE fta_cd = 'FTA' AND sect = '일반원칙'
            ORDER BY rowid`)) as Record<string, unknown>[]
    ).map((r) => ({
      heading: str(r.gubun),
      content: str(r.content),
    }));
  });
}

export type FtaAgreementDetail = {
  code: string;
  name: string;
  countries: string[];
  effect: string;
  baseYear: string;
  treatyUrl: string;
  certificate: string[];
  criterion: string[];
  sections: { heading: string; content: string }[];
  forms: { kind: string; name: string; url: string }[];
  rateCodes: { code: string; name: string; note: string }[];
  quotas: { item: string; hs: string; name: string; qty: string; agency: string; year: string }[];
  laws: { name: string; href: string }[];
  posts: { title: string; date: string; url: string }[];
};

function splitList(raw: string): string[] {
  return raw
    .split(/\s*-\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function nameTokens(name: string, countries: string): string[] {
  const out: string[] = [];
  for (const part of [name, ...countries.split(/[,、]/)]) {
    const token = part.trim();
    if (token.length < 2 || out.includes(token)) continue;
    out.push(token);
  }
  return out;
}

function lawHref(name: string): string {
  const rule = /시행령|시행규칙|고시|요령|지침/.test(name);
  const q = new URLSearchParams({ name });
  if (rule) q.set("tab", "admrul");
  return `/laws/general/customs/read?${q}`;
}

export async function getFtaAgreementDetail(code: string): Promise<FtaAgreementDetail | null> {
  const key = code.trim();
  if (!key) return null;
  return await withDb(async (db) => {
    if (!(await smartLawTableExists(db, "cl_fta_nation"))) return null;
    const row = (await db.get(
      `SELECT fta_cd, fta_nm, nation_nm, cert_desc, psr_desc, effect_dt, treaty_url, base_yr
           FROM cl_fta_nation WHERE fta_cd = ?`,
      [key],
    )) as Record<string, unknown> | undefined;
    if (!row) return null;
    const name = str(row.fta_nm);
    const countryText = str(row.nation_nm);
    const tokens = nameTokens(name, countryText);
    const sections = (await smartLawTableExists(db, "cl_fta_general"))
      ? (
          (await db.all(
            `SELECT gubun, content FROM cl_fta_general WHERE fta_cd = ? ORDER BY rowid`,
            [key],
          )) as Record<string, unknown>[]
        )
          .map((r) => ({ heading: str(r.gubun), content: str(r.content) }))
          .filter((r) => r.heading || r.content)
      : [];
    const forms = (await smartLawTableExists(db, "cl_fta_attach"))
      ? (
          (await db.all(
            `SELECT doc_gb, file_nm, file_url FROM cl_fta_attach WHERE fta_cd = ? ORDER BY file_nm`,
            [key],
          )) as Record<string, unknown>[]
        )
          .map((r) => ({ kind: str(r.doc_gb), name: str(r.file_nm), url: str(r.file_url) }))
          .filter((r) => r.url)
      : [];
    const rateCodes = await agreementRateCodes(db, key);
    const quotas = (await smartLawTableExists(db, "cl_fta_recom"))
      ? (
          (await db.all(
            `SELECT item_nm, hsk_cd, hsk_disp, hsk_nm, qty_txt, agency, base_yr
               FROM cl_fta_recom WHERE fta_cd = ? ORDER BY item_nm, seq_no, hsk_cd`,
            [key],
          )) as Record<string, unknown>[]
        ).map((r) => ({
          item: str(r.item_nm),
          hs: str(r.hsk_disp) || str(r.hsk_cd),
          name: str(r.hsk_nm),
          qty: str(r.qty_txt),
          agency: str(r.agency),
          year: str(r.base_yr),
        }))
      : [];
    return {
      code: str(row.fta_cd),
      name,
      countries: countryText.split(/[,、]/).map((part) => part.trim()).filter(Boolean),
      effect: str(row.effect_dt),
      baseYear: str(row.base_yr),
      treatyUrl: await ftaTreatyPath(db, key),
      certificate: splitList(str(row.cert_desc)),
      criterion: splitList(str(row.psr_desc)),
      sections,
      forms,
      rateCodes,
      quotas,
      laws: await agreementLaws(db, tokens),
      posts: await agreementPosts(db, tokens),
    };
  });
}

async function agreementLaws(db: SmartLawDb, tokens: string[]): Promise<{ name: string; href: string }[]> {
  const names: { name: string; rank: number }[] = [];
  if (await smartLawTableExists(db, "laws")) {
    const acts = (await db.all(`SELECT law_name_kr FROM laws
          WHERE law_name_kr LIKE '%자유무역협정의 이행을 위한 관세법의 특례에 관한 법률'`)) as Record<string, unknown>[];
    for (const act of acts) names.push({ name: str(act.law_name_kr), rank: 1 });
  }
  if (await smartLawTableExists(db, "admin_rule")) {
    const tokenSql = tokens.map(() => "(law_name LIKE '%' || ? || '%' AND law_name LIKE '%협정%')").join(" OR ");
    const where = [
      "law_name LIKE '%자유무역협정의 이행을 위한 관세법의 특례%'",
      "law_name LIKE '%자유무역협정 원산지인증수출자%'",
      tokenSql,
    ]
      .filter(Boolean)
      .join(" OR ");
    const rules = (await db.all(`SELECT law_name, gubun FROM admin_rule WHERE gubun <> 'adm_rule' AND (${where})`, [tokens])) as Record<string, unknown>[];
    const best = new Map<string, number>();
    for (const rule of rules) {
      const lawName = str(rule.law_name);
      if (!lawName) continue;
      if (!/시행령|시행규칙|고시|요령|지침/.test(lawName)) continue;
      const gubun = str(rule.gubun);
      const score = /^\d+$/.test(gubun) ? 10 + gubun.length : 1;
      if ((best.get(lawName) ?? 0) < score) best.set(lawName, score);
    }
    for (const lawName of best.keys()) {
      let rank = 5;
      if (lawName.includes("시행령")) rank = 2;
      else if (lawName.includes("시행규칙")) rank = 3;
      else if (lawName.includes("고시")) rank = 4;
      names.push({ name: lawName, rank });
    }
  }
  const seen = new Set<string>();
  return names
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, "ko"))
    .filter((item) => {
      if (!item.name || seen.has(item.name)) return false;
      seen.add(item.name);
      return true;
    })
    .map((item) => ({ name: item.name, href: lawHref(item.name) }));
}

async function agreementPosts(db: SmartLawDb, tokens: string[]): Promise<{ title: string; date: string; url: string }[]> {
  if (tokens.length === 0) return [];
  const posts: { title: string; date: string; url: string }[] = [];
  const like = tokens.map(() => "agreement_name LIKE '%' || ? || '%' OR title LIKE '%' || ? || '%'").join(" OR ");
  const params = tokens.flatMap((token) => [token, token]);
  if (await smartLawTableExists(db, "fta_general_materials")) {
    const rows = (await db.all(`SELECT title, registered_date, source_url FROM fta_general_materials WHERE ${like} ORDER BY registered_date`, params)) as Record<string, unknown>[];
    for (const row of rows) posts.push({ title: str(row.title), date: str(row.registered_date), url: str(row.source_url) });
  }
  if (await smartLawTableExists(db, "fta_execution_guidance_post")) {
    const guideLike = tokens.map(() => "category LIKE '%' || ? || '%' OR title LIKE '%' || ? || '%'").join(" OR ");
    const rows = (await db.all(`SELECT title, registered_date, source_url FROM fta_execution_guidance_post WHERE ${guideLike} ORDER BY registered_date`, params)) as Record<string, unknown>[];
    for (const row of rows) posts.push({ title: str(row.title), date: str(row.registered_date), url: str(row.source_url) });
  }
  const seen = new Set<string>();
  return posts.filter((post) => {
    const key = post.title.replace(/\s+/g, "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function agreementRateCodes(db: SmartLawDb, ftaCd: string): Promise<{ code: string; name: string; note: string }[]> {
  if (!(await smartLawTableExists(db, "bgwanse"))) return [];
  const rows = (await db.all(`SELECT Gwanse_code, Gwanse_semyung, Gwanse_gubun
         FROM bgwanse WHERE Gwanse_agreecd = ?`, [`KR-${ftaCd}`])) as Record<string, unknown>[];
  if (rows.length === 0) return [];
  const gubun = str(rows[0]?.Gwanse_gubun);
  const choices = new Map<string, string>();
  if (gubun) {
    const aliases = (await db.all(`SELECT Gwanse_code, Gwanse_semyung
           FROM bgwanse
          WHERE Gwanse_gubun = ? AND IFNULL(Gwanse_agreecd, '') = '' AND Gwanse_code GLOB 'Y*'`, [gubun])) as Record<string, unknown>[];
    for (const alias of aliases) {
      const digit = str(alias.Gwanse_code).replace(/\D/g, "");
      const label = str(alias.Gwanse_semyung).split("-").pop()?.trim() ?? "";
      if (digit && label) choices.set(digit, label);
    }
  }
  return rows
    .map((row) => presentRateCode(str(row.Gwanse_code), str(row.Gwanse_semyung), choices))
    .filter((row) => row.code)
    .sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }));
}

const YEAR_NATION: Record<string, string> = {
  FCL: "CL",
  FSG: "SG",
  FEF: "CH",
  FAS: "AS",
  FIN: "IN",
  FEU: "EU",
  FPE: "PE",
  FUS: "US",
  FTR: "TR",
  FAU: "AU",
  FCA: "CA",
  FCO: "CO",
  FCN: "CN",
  FVN: "VE",
  FNZ: "NZ",
};

/** 세율 fta_cd(FCL) → FTA PASS agreement_code / 관세청 PSR agreement_key */
const ORIGIN_PASS_CODE: Record<string, string> = {
  FCL: "KORCL",
  FSG: "KORSG",
  FEF: "KOREF",
  FAS: "KORAS",
  FIN: "KORIN",
  FEU: "KOREU",
  FGB: "KORUK",
  FPE: "KORPE",
  FUS: "KORUS",
  FTR: "KORTR",
  FAU: "KORAU",
  FCA: "KORCA",
  FCO: "KORCO",
  FCN: "KORCN",
  FVN: "KORVN",
  FNZ: "KORNZ",
  FCE: "KORC1",
  FRC: "KORCP",
  FIL: "KORIL",
  FKH: "KORKH",
  FID: "KORID",
  FPH: "KORPH",
  FAE: "KORAE",
};

const ORIGIN_PSR_KEY: Record<string, string> = {
  FCL: "cl",
  FSG: "sg",
  FEF: "ch",
  FAS: "as2",
  FIN: "in",
  FEU: "eu",
  FGB: "gb",
  FPE: "pe",
  FUS: "us",
  FTR: "tr",
  FAU: "au",
  FCA: "ca",
  FCO: "co",
  FCN: "cn",
  FVN: "vn",
  FNZ: "nz",
  FCE: "ni",
  FRC: "rc",
  FIL: "il",
  FKH: "kh",
  FID: "id",
  FPH: "ph",
  FAE: "ae",
};

export type AgreementDutyHit = { hs: string; name: string; rate: string; code: string };
export type AgreementOriginDetail = { label: string; content: string };
export type AgreementOriginHit = {
  hs: string;
  rule: string;
  detail?: AgreementOriginDetail[];
  detailNote?: string;
  co?: CoForm;
};

export async function searchAgreementDuty(ftaCd: string, hsRaw: string): Promise<{
  rows: AgreementDutyHit[];
  note: string;
  found: boolean;
}> {
  const hs = digits(hsRaw);
  if (hs.length !== 10) throw new Error("HS코드 10단위를 입력하시기 바랍니다.");
  const key = ftaCd.trim().toUpperCase();
  return await withDb(async (db) => {
    const yearRow = (await smartLawTableExists(db, "cl_fta_nation"))
      ? ((await db.get(`SELECT base_yr FROM cl_fta_nation WHERE fta_cd = ?`, [key])) as
          | { base_yr?: unknown }
          | undefined)
      : undefined;
    const year = Number(str(yearRow?.base_yr)) || 2026;
    if (!(await smartLawTableExists(db, "tariff_item"))) return { rows: [], note: "", found: false };
    const item = (await db.get(
      `SELECT item_name FROM tariff_item
          WHERE year = ? AND country_code = 'KR'
            AND replace(replace(hs_code, '.', ''), '-', '') = ?`,
      [year, hs],
    )) as { item_name?: unknown } | undefined;
    if (!item) return { rows: [], note: "", found: false };
    const rates = (await smartLawTableExists(db, "tariff_item_detail"))
      ? ((await db.all(
          `SELECT rate_code, rate_value FROM tariff_item_detail
              WHERE year = ? AND country_code = 'KR'
                AND replace(replace(hs_code, '.', ''), '-', '') = ?
                AND rate_code LIKE ? || '%'`,
          [year, hs, key],
        )) as Record<string, unknown>[])
      : [];
    const rows = rates
      .map((row) => ({
        hs: formatHs10(hs),
        name: str(item.item_name),
        rate: formatRate(str(row.rate_value)),
        code: str(row.rate_code),
      }))
      .filter((row) => row.code.startsWith(key))
      .sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }));
    return { rows, note: await scheduleNote(db, key, hs), found: true };
  });
}

export async function searchAgreementOrigin(ftaCd: string, hsRaw: string): Promise<{
  rows: AgreementOriginHit[];
  note: string;
}> {
  const result = await searchOriginByHs({ code: ftaCd, hs: hsRaw });
  return {
    rows: result.rows.map((row) => ({
      hs: row.hs,
      rule: row.rule,
      detail: row.detail,
      detailNote: row.detailNote,
      co: row.co,
    })),
    note: result.note,
  };
}

export type OriginGlanceRow = {
  code: string;
  name: string;
  countries: string;
  hs: string;
  rule: string;
  detail?: AgreementOriginDetail[];
  detailNote?: string;
  co?: CoForm;
};

/** HS(류) 기준 원산지결정기준 — 협정 1건 또는 전체 국가 한눈 조회 */
export async function searchOriginByHs(input: { code?: string; hs: string }): Promise<{
  rows: OriginGlanceRow[];
  note: string;
}> {
  const hs = digits(input.hs);
  if (![2, 4, 6, 10].includes(hs.length)) {
    throw new Error("HS코드는 2자리, 4자리, 6자리 또는 10자리로 입력하시기 바랍니다.");
  }
  const chapter = hs.slice(0, 2).padStart(2, "0");
  const want = str(input.code).toUpperCase();
  return await withDb(async (db) => {
    if (!(await smartLawTableExists(db, "cl_fta_nation"))) return { rows: [], note: "" };
    const agreements = (
      (await db.all(`SELECT fta_cd, fta_nm, nation_nm
             FROM cl_fta_nation
            ORDER BY COALESCE(sort_no, 9999), fta_cd`)) as Record<string, unknown>[]
    )
      .map((r) => ({
        code: str(r.fta_cd),
        name: str(r.fta_nm),
        countries: str(r.nation_nm),
      }))
      .filter((row) => row.code && (!want || row.code === want));

    const rows: OriginGlanceRow[] = [];
    const notes: string[] = [];
    for (const agreement of agreements) {
      const chapterRow = await chapterOrigin(db, agreement.code, chapter);
      const detail = await chapterOriginDetail(db, agreement.code, chapter);
      if (!chapterRow.rule && !detail.rows.length) {
        if (want && chapterRow.note) notes.push(chapterRow.note);
        continue;
      }
      rows.push({
        code: agreement.code,
        name: agreement.name,
        countries: agreement.countries,
        hs: chapter,
        rule: stripOriginRefMark(chapterRow.rule),
        detail: detail.rows.length ? detail.rows : undefined,
        detailNote: detail.note || undefined,
        co: coFormOf(agreement.code),
      });
      if (chapterRow.note) notes.push(`${agreement.name}: ${chapterRow.note.replace(/^※\s*/, "")}`);
    }
    return {
      rows,
      note: notes[0] ?? "",
    };
  });
}

function stripOriginRefMark(rule: string): string {
  return rule
    .replace(/\s*\[참조\]/g, "")
    .replace(/\s*\[參考\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatHs10(hs: string): string {
  return `${hs.slice(0, 4)}.${hs.slice(4, 6)}-${hs.slice(6)}`;
}

/**
 * 류(2자리) 원산지 기준
 * 관세청 PSR(fta_psr_item) → FTA PASS. cl_fta_* 미사용.
 */
async function chapterOrigin(db: SmartLawDb, ftaCd: string, chapter: string): Promise<{ rule: string; note: string }> {
  const psrKey = ORIGIN_PSR_KEY[ftaCd] ?? "";
  const passCode = ORIGIN_PASS_CODE[ftaCd] ?? "";
  const like = `${chapter}%`;

  if (psrKey && await smartLawTableExists(db, "fta_psr_item")) {
    const rules = (
      (await db.all(`SELECT DISTINCT TRIM(preference_criterion_ko) AS rule
             FROM fta_psr_item
            WHERE lower(agreement_key) = lower(?)
              AND replace(replace(hs_code, '.', ''), '-', '') LIKE ?
              AND TRIM(IFNULL(preference_criterion_ko, '')) <> ''`, [psrKey, like])) as {
        rule?: unknown;
      }[]
    )
      .map((row) => stripOriginRefMark(str(row.rule)))
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);
    if (rules.length === 1) return { rule: rules[0], note: "" };
    if (rules.length > 1) {
      // 류 내 기준이 여러 개면 대표(최빈) 문구 사용
      const topRows = (await db.all(
        `SELECT TRIM(preference_criterion_ko) AS rule, COUNT(*) AS n
             FROM fta_psr_item
            WHERE lower(agreement_key) = lower(?)
              AND replace(replace(hs_code, '.', ''), '-', '') LIKE ?
              AND TRIM(IFNULL(preference_criterion_ko, '')) <> ''
            GROUP BY TRIM(preference_criterion_ko)`,
        [psrKey, like],
      )) as { rule?: unknown; n?: unknown }[];
      const top = [...topRows].sort((a, b) => {
        const dn = Number(b.n) - Number(a.n);
        if (dn !== 0) return dn;
        return str(b.rule).length - str(a.rule).length;
      })[0];
      const rule = stripOriginRefMark(str(top?.rule));
      if (rule) return { rule, note: `※ 동일 류 내 세부기준이 ${rules.length}종 있음(대표 기준 표시)` };
    }
  }

  if (passCode && await smartLawTableExists(db, "fta_pass_origin_rules")) {
    const topRows = (await db.all(
      `SELECT TRIM(origin_rule_text) AS rule, COUNT(*) AS n
           FROM fta_pass_origin_rules
          WHERE agreement_code = ?
            AND hs6_code LIKE ?
            AND TRIM(IFNULL(origin_rule_text, '')) <> ''
          GROUP BY TRIM(origin_rule_text)`,
      [passCode, like],
    )) as { rule?: unknown; n?: unknown }[];
    const top = [...topRows].sort((a, b) => {
      const dn = Number(b.n) - Number(a.n);
      if (dn !== 0) return dn;
      return str(b.rule).length - str(a.rule).length;
    })[0];
    const rule = stripOriginRefMark(str(top?.rule));
    if (rule) return { rule, note: "" };
  }

  return { rule: "", note: "" };
}

/** FTA PASS 약어를 학습해 참조 항목을 구성. cl_fta_* 미사용. */
async function chapterOriginDetail(
  db: SmartLawDb,
  ftaCd: string,
  chapter: string,
): Promise<{ rows: AgreementOriginDetail[]; note: string }> {
  const passCode = ORIGIN_PASS_CODE[ftaCd] ?? "";
  const like = `${chapter}%`;
  let code = "";

  if (passCode && (await smartLawTableExists(db, "ftapass_origin_determination"))) {
    const top = (await db.get(
      `SELECT TRIM(co_prt_cd) AS code, COUNT(*) AS n
           FROM ftapass_origin_determination
          WHERE ont_agree_cd = ?
            AND hs6_cd LIKE ?
            AND TRIM(IFNULL(co_prt_cd, '')) <> ''
          GROUP BY TRIM(co_prt_cd)
          ORDER BY n DESC
          LIMIT 1`,
      [passCode, like],
    )) as { code?: unknown } | undefined;
    code = str(top?.code);
  }
  if (!code && passCode && (await smartLawTableExists(db, "fta_pass_origin_rules"))) {
    const top = (await db.get(
      `SELECT TRIM(abbreviation) AS code, COUNT(*) AS n
           FROM fta_pass_origin_rules
          WHERE agreement_code = ?
            AND hs6_code LIKE ?
            AND TRIM(IFNULL(abbreviation, '')) <> ''
          GROUP BY TRIM(abbreviation)
          ORDER BY n DESC
          LIMIT 1`,
      [passCode, like],
    )) as { code?: unknown } | undefined;
    code = str(top?.code);
  }
  if (!code) return { rows: [], note: "" };

  const learned = learnOriginDetail(ftaCd, code);
  const rows: AgreementOriginDetail[] = [
    { label: "완전생산", content: learned.wholly },
    { label: "가공공정", content: learned.process },
    { label: "세번변경", content: learned.change },
    { label: "최소기준", content: learned.deMinimis },
    { label: "부가가치기준 (집적법)", content: learned.vaBuildUp },
    { label: "부가가치기준 (공제법)", content: learned.vaBuildDown },
    { label: "부가가치기준 (MC법)", content: learned.vaMc },
    { label: "부가가치기준 (순원가법)", content: learned.vaNet },
    { label: "원산지확인서", content: learned.confirm },
    { label: "원산지증명서", content: coSummary(coFormOf(ftaCd)) },
  ];
  return { rows, note: originDetailNote() };
}

async function scheduleNote(db: SmartLawDb, ftaCd: string, hs: string): Promise<string> {
  const nation = YEAR_NATION[ftaCd];
  if (!nation || !(await smartLawTableExists(db, "fta_hs_rate_year"))) return "";
  const rates = (await db.all(
    `SELECT DISTINCT TRIM(agreement_rate) AS r
         FROM fta_hs_rate_year
        WHERE nation_code = ? AND replace(hs_no, ' ', '') = ?`,
    [nation, hs],
  )) as { r?: unknown }[];
  if (rates.length !== 1) return "";
  return "연차세율이 종료되어 더 이상 인하되는 세율이 없습니다.";
}

function presentRateCode(
  code: string,
  semyung: string,
  choices: Map<string, string>,
): { code: string; name: string; note: string } {
  const text = semyung.replace(/한\./g, "한·");
  const dash = text.indexOf("-");
  if (dash > 0) {
    const head = text.slice(0, dash).trim();
    const tail = text.slice(dash + 1).trim();
    const digit = code.match(/(\d+)$/)?.[1] ?? "";
    const choice = digit ? choices.get(digit) ?? "" : "";
    const name = choice && !/[（(]/.test(head) ? `${head}(${choice})` : head;
    return { code, name, note: tail };
  }
  return { code, name: text, note: "" };
}

export async function listFtaNations(): Promise<FtaNation[]> {
  return await withDb(async (db) => {
    if (!(await smartLawTableExists(db, "fta_agreement_master"))) return [];
    return (
      (await db.all(
        `SELECT nation_code, nation_name_kr, nation_name_en
             FROM fta_agreement_master
            WHERE UPPER(TRIM(IFNULL(crawl_yn,'Y'))) = 'Y'
              AND UPPER(TRIM(nation_code)) <> 'ALL'
            ORDER BY COALESCE(tab_order, 9999), nation_code`,
      )) as Record<string, unknown>[]
    ).map((r) => {
      const code = str(r.nation_code).toUpperCase();
      return {
        code,
        nameKo: str(r.nation_name_kr) || code,
        nameEn: str(r.nation_name_en),
        psrKey: PSR_KEY[code] ?? code.toLowerCase(),
      };
    });
  });
}

export async function listOriginChapters(nation: string): Promise<FtaChapter[]> {
  const key = PSR_KEY[nation.trim().toUpperCase()] ?? nation.trim().toLowerCase();
  return await withDb(async (db) => {
    if (!(await smartLawTableExists(db, "fta_psr_category")) || !key) return [];
    return (
      (await db.all(
        `SELECT category_code, item_name_ko, item_name_en
             FROM fta_psr_category
            WHERE agreement_key = ?
            ORDER BY category_code`,
        [key],
      )) as Record<string, unknown>[]
    ).map((r) => ({
      code: str(r.category_code).replace(/\D/g, "").padStart(2, "0").slice(-2),
      nameKo: str(r.item_name_ko),
      nameEn: str(r.item_name_en),
    }));
  });
}

export async function searchOrigin(input: { nation?: string; chapter?: string; hs?: string; page?: number }) {
  const { page, pageSize, offset } = pageOf(input.page);
  const nation = str(input.nation).toUpperCase();
  const key = PSR_KEY[nation] ?? nation.toLowerCase();
  const chapter = digits(str(input.chapter)).slice(0, 2).padStart(2, "0");
  const hs = digits(str(input.hs));
  const chapters = await listOriginChapters(nation);
  if (!str(input.chapter) && !hs) {
    return { chapters, rows: [] as OriginRow[], total: 0, page, pageSize, psrKey: key };
  }
  return await withDb(async (db) => {
    if (!(await smartLawTableExists(db, "fta_psr_item"))) {
      return { chapters, rows: [] as OriginRow[], total: 0, page, pageSize, psrKey: key };
    }
    const clauses = ["agreement_key = ?"];
    const params: unknown[] = [key];
    if (str(input.chapter)) {
      clauses.push("substr('00' || TRIM(category_code), -2) = ?");
      params.push(chapter);
    }
    if (hs) {
      clauses.push("replace(replace(hs_code,'.',''),'-','') LIKE ?");
      params.push(`${hs}%`);
    }
    const where = clauses.join(" AND ");
    const total = Number(
      (
        (await db.get(`SELECT COUNT(*) AS c FROM fta_psr_item WHERE ${where}`, params)) as
          | { c?: number }
          | undefined
      )?.c ?? 0,
    );
    const rows = (
      (await db.all(
        `SELECT id, hs_code, division, item_name_ko, item_name_en,
                  preference_criterion_ko, preference_criterion_en
             FROM fta_psr_item
            WHERE ${where}
            ORDER BY hs_code, category_code, id
            LIMIT ? OFFSET ?`,
        [...params, pageSize, offset],
      )) as Record<string, unknown>[]
    ).map((r) => ({
      id: Number(r.id) || 0,
      hs: str(r.hs_code),
      division: str(r.division),
      nameKo: str(r.item_name_ko),
      nameEn: str(r.item_name_en),
      ruleKo: str(r.preference_criterion_ko),
      ruleEn: str(r.preference_criterion_en),
    }));
    return { chapters, rows, total, page, pageSize, psrKey: key };
  });
}

export type OriginRow = {
  id: number;
  hs: string;
  division: string;
  nameKo: string;
  nameEn: string;
  ruleKo: string;
  ruleEn: string;
};

export async function listRateChapters(nation: string): Promise<FtaChapter[]> {
  const code = nation.trim().toUpperCase();
  return await withDb(async (db) => {
    if (!(await smartLawTableExists(db, "fta_hs_chapter")) || !code) return [];
    return (
      (await db.all(
        `SELECT chapter_code, chapter_name_kr, chapter_name_en
             FROM fta_hs_chapter
            WHERE UPPER(TRIM(nation_code)) = ?
            ORDER BY chapter_code`,
        [code],
      )) as Record<string, unknown>[]
    ).map((r) => ({
      code: str(r.chapter_code).replace(/\D/g, "").padStart(2, "0").slice(-2),
      nameKo: str(r.chapter_name_kr),
      nameEn: str(r.chapter_name_en),
    }));
  });
}

export type RateRow = {
  hs: string;
  division: string;
  name: string;
  baseYear: string;
  baseRate: string;
  hasYears: boolean;
};

export async function searchRates(input: { nation?: string; chapter?: string; hs?: string; page?: number }) {
  const { page, pageSize, offset } = pageOf(input.page);
  const nation = str(input.nation).toUpperCase();
  const chapter = digits(str(input.chapter)).slice(0, 2);
  const hs = digits(str(input.hs));
  const chapters = await listRateChapters(nation);
  if (!nation || (!str(input.chapter) && !hs)) {
    return { chapters, rows: [] as RateRow[], total: 0, page, pageSize };
  }
  return await withDb(async (db) => {
    if (!(await smartLawTableExists(db, "fta_hs_item"))) {
      return { chapters, rows: [] as RateRow[], total: 0, page, pageSize };
    }
    const clauses = ["UPPER(TRIM(nation_code)) = ?"];
    const params: unknown[] = [nation];
    if (str(input.chapter)) {
      clauses.push("substr(replace(hs_no,' ',''),1,2) = ?");
      params.push(chapter.padStart(2, "0"));
    }
    if (hs) {
      clauses.push("replace(hs_no,' ','') LIKE ?");
      params.push(`${hs}%`);
    }
    const where = clauses.join(" AND ");
    const total = Number(
      ((await db.get(`SELECT COUNT(*) AS c FROM fta_hs_item WHERE ${where}`, params)) as { c?: number } | undefined)?.c ?? 0,
    );
    const rows = (
      (await db.all(`SELECT replace(hs_no,' ','') AS hs_no, division, item_name, base_year, base_rate, has_year_link
             FROM fta_hs_item
            WHERE ${where}
            ORDER BY replace(hs_no,' ',''), item_id
            LIMIT ? OFFSET ?`, [...params, pageSize, offset])) as Record<string, unknown>[]
    ).map((r) => ({
      hs: str(r.hs_no),
      division: str(r.division),
      name: str(r.item_name),
      baseYear: str(r.base_year),
      baseRate: formatRate(str(r.base_rate)),
      hasYears: str(r.has_year_link).toUpperCase() === "Y",
    }));
    return { chapters, rows, total, page, pageSize };
  });
}

export async function listRateYears(nation: string, hs: string) {
  const code = nation.trim().toUpperCase();
  const digitsHs = hs.replace(/\D/g, "");
  return await withDb(async (db) => {
    if (!(await smartLawTableExists(db, "fta_hs_rate_year")) || !code || !digitsHs) return [];
    return (
      (await db.all(`SELECT rate_year, agreement_rate
             FROM fta_hs_rate_year
            WHERE UPPER(TRIM(nation_code)) = ?
              AND replace(hs_no,' ','') = ?
            ORDER BY rate_year`, [code, digitsHs])) as Record<string, unknown>[]
    ).map((r) => ({
      year: str(r.rate_year),
      rate: formatRate(str(r.agreement_rate)),
    }));
  });
}
