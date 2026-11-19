import { openSmartLawDb, type SmartLawDb } from "@/hanjoo/lib/smart-law-db";

/** WCO English HS Explanatory Notes (hs_manual_*) */

export type EnManualChapter = {
  chapter_code: string;
  chapter_name_en: string;
  section_note: string;
  chapter_note: string;
};

export type EnManualHeading = {
  heading_code: string;
  heading_name_en: string;
  note: string;
};

function plain(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<a\b[^>]*>/gi, "")
    .replace(/<\/a>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** First non-empty line after "Chapter N" as English chapter title */
export function chapterTitleFromHstd(raw: string, chapterCode: string): string {
  const text = plain(raw);
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return "";
  const n = Number(chapterCode);
  const head = new RegExp(`^Chapter\\s*0*${n}\\b`, "i");
  let i = 0;
  if (head.test(lines[0] ?? "")) i = 1;
  return (lines[i] ?? "").replace(/\s+/g, " ").trim();
}

/** First line of heading note → short English title (strip "21.01" prefix) */
export function headingTitleFromHsfd(raw: string, headingCode: string): string {
  const text = plain(raw);
  const first = text.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "";
  if (!first) return "";
  const digits = headingCode.replace(/\D/g, "").padStart(4, "0");
  const dotted = `${digits.slice(0, 2)}.${digits.slice(2)}`;
  let t = first
    .replace(new RegExp(`^${dotted}\\s*[-–—:]?\\s*`, "i"), "")
    .replace(new RegExp(`^${digits}\\s*[-–—:]?\\s*`, "i"), "")
    .trim();
  if (t.length > 180) {
    const cut = t.search(/\.\s/);
    if (cut > 40 && cut < 180) t = t.slice(0, cut + 1);
  }
  return t;
}

export async function listEnManualYears(): Promise<string[]> {
  const db = await openSmartLawDb();
  try {
    const rows = await db.all(
      `SELECT DISTINCT TRIM(aply_year) AS y
         FROM hs_manual_meta
        WHERE manl_orgn_tpcd_nm = 'WCO'
          AND TRIM(IFNULL(aply_year,'')) != ''`,
    );
    return rows
      .map((r) => String(r.y).trim())
      .filter(Boolean)
      .filter((y) => Number.isFinite(Number(y)))
      .sort((a, b) => Number(b) - Number(a));
  } finally {
    await db.close();
  }
}

/** Pick WCO aply_year: exact match, else max year ≤ requested, else latest */
export async function resolveEnManualYear(
  requested: number | string,
): Promise<string> {
  const years = await listEnManualYears();
  if (!years.length) return String(requested || "");
  const want = Number(requested);
  if (years.includes(String(want))) return String(want);
  if (Number.isFinite(want) && want > 0) {
    const notAfter = years
      .map(Number)
      .filter((y) => Number.isFinite(y) && y <= want)
      .sort((a, b) => b - a);
    if (notAfter.length) return String(notAfter[0]);
  }
  return years[0]!;
}

async function pickContent(
  db: SmartLawDb,
  metaId: number,
  contentType: string,
  lang = "eng",
): Promise<string> {
  const row = await db.get(
    `SELECT content_text FROM hs_manual_content
      WHERE meta_id = ? AND content_type = ? AND lang_code = ?
      LIMIT 1`,
    [metaId, contentType, lang],
  );
  return plain(String(row?.content_text ?? ""));
}

async function findMetaId(
  db: SmartLawDb,
  year: string,
  ut: string,
  sgn: string,
): Promise<number | null> {
  const candidates = new Set<string>();
  const digits = sgn.replace(/\D/g, "");
  candidates.add(sgn.trim());
  if (ut === "01" || ut === "02") {
    if (digits) {
      candidates.add(digits.padStart(2, "0"));
      candidates.add(digits.replace(/^0+/, "") || "0");
    }
  }
  if (ut === "03" && digits) {
    candidates.add(digits.padStart(4, "0"));
    if (digits.length >= 4) candidates.add(digits.slice(0, 4));
  }
  for (const c of candidates) {
    const row = await db.get(
      `SELECT id FROM hs_manual_meta
        WHERE TRIM(aply_year) = ?
          AND manl_orgn_tpcd_nm = 'WCO'
          AND manl_ut_tpcd = ?
          AND trim(manl_ut_sgn) = ?
        LIMIT 1`,
      [year, ut, c],
    );
    if (row?.id != null) return Number(row.id);
  }
  return null;
}

export async function listEnManualChapters(
  year: string,
): Promise<EnManualChapter[]> {
  const db = await openSmartLawDb();
  try {
    const metas = await db.all(
      `SELECT m.id, m.manl_ut_sgn
         FROM hs_manual_meta m
        WHERE TRIM(m.aply_year) = ?
          AND m.manl_orgn_tpcd_nm = 'WCO'
          AND m.manl_ut_tpcd = '02'
        ORDER BY CAST(m.manl_ut_sgn AS INTEGER)`,
      [year],
    );

    const out: EnManualChapter[] = [];
    for (const m of metas) {
      const code = String(m.manl_ut_sgn).replace(/\D/g, "").padStart(2, "0");
      const hstd = await pickContent(db, Number(m.id), "hstd");
      const sct = await pickContent(db, Number(m.id), "sct");
      out.push({
        chapter_code: code,
        chapter_name_en: chapterTitleFromHstd(hstd, code) || `Chapter ${code}`,
        section_note: sct,
        chapter_note: hstd,
      });
    }
    return out;
  } finally {
    await db.close();
  }
}

export async function getEnManualChapter(
  year: string,
  chapterCode: string,
): Promise<{
  chapter: EnManualChapter | null;
  headings: EnManualHeading[];
  sourceLabel: string;
}> {
  const code = chapterCode.replace(/\D/g, "").slice(0, 2).padStart(2, "0");
  const db = await openSmartLawDb();
  try {
    const metaId = await findMetaId(db, year, "02", code);
    let chapter: EnManualChapter | null = null;
    if (metaId != null) {
      const hstd = await pickContent(db, metaId, "hstd");
      const sct = await pickContent(db, metaId, "sct");
      chapter = {
        chapter_code: code,
        chapter_name_en: chapterTitleFromHstd(hstd, code) || `Chapter ${code}`,
        section_note: sct,
        chapter_note: hstd,
      };
    }

    const headingMetas = await db.all(
      `SELECT m.id, m.manl_ut_sgn
         FROM hs_manual_meta m
        WHERE TRIM(m.aply_year) = ?
          AND m.manl_orgn_tpcd_nm = 'WCO'
          AND m.manl_ut_tpcd = '03'
          AND (
            trim(m.manl_ut_sgn) LIKE ?
            OR trim(m.manl_ut_sgn) LIKE ?
          )
        ORDER BY trim(m.manl_ut_sgn)`,
      [year, `${code}%`, `${Number(code)}%`],
    );

    const headings: EnManualHeading[] = [];
    for (const hm of headingMetas) {
      const hc = String(hm.manl_ut_sgn)
        .replace(/\D/g, "")
        .padStart(4, "0")
        .slice(0, 4);
      if (!hc.startsWith(code)) continue;
      const note = await pickContent(db, Number(hm.id), "hsfd");
      headings.push({
        heading_code: hc,
        heading_name_en: headingTitleFromHsfd(note, hc) || hc,
        note,
      });
    }

    return {
      chapter,
      headings,
      sourceLabel: `${year} WCO Explanatory Notes`,
    };
  } finally {
    await db.close();
  }
}

export async function getEnManualHeadingNote(
  year: string,
  headingCode: string,
): Promise<EnManualHeading | null> {
  const hc = headingCode.replace(/\D/g, "").padStart(4, "0").slice(0, 4);
  const db = await openSmartLawDb();
  try {
    const metaId = await findMetaId(db, year, "03", hc);
    if (metaId == null) return null;
    const note = await pickContent(db, metaId, "hsfd");
    return {
      heading_code: hc,
      heading_name_en: headingTitleFromHsfd(note, hc) || hc,
      note,
    };
  } finally {
    await db.close();
  }
}
