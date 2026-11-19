import { NextRequest, NextResponse } from "next/server";
import {
  smartLawTableExists,
  type SmartLawDb,
} from "@/app/lib/smart-law-db";
import { withTariffDb } from "@/app/tariff/lib/tariff-db";
import {
  firstChapterCodeForSection,
  sectionCodeFromHsSgn,
} from "@/app/lib/hs-chapter-to-section";
import { hsManualPaneTitleFromBody } from "@/app/lib/hs-explanatory-html";

export const runtime = "nodejs";

type MetaRow = {
  id: number;
  aply_year: string;
  manl_orgn_tpcd: string | null;
  manl_orgn_tpcd_nm: string | null;
  manl_ut_tpcd: string;
  manl_ut_tpcd_nm: string | null;
  manl_ut_sgn: string;
  display_title: string | null;
};

type ContentRow = {
  meta_id: number;
  content_type: string;
  lang_code: string;
  content_text: string | null;
};

type Pane = {
  titleKo: string;
  titleEn: string;
  bodyKo: string;
  bodyEn: string;
  other: string;
};

function pickText(
  rows: ContentRow[],
  contentType: string,
  lang: string,
): string {
  const r = rows.find(
    (x) => x.content_type === contentType && x.lang_code === lang,
  );
  return (r?.content_text ?? "").trim();
}

function mergeHeadingBodies(
  sepKo: string,
  sepEn: string,
  bodiesKo: string[],
  bodiesEn: string[],
): { bodyKo: string; bodyEn: string } {
  const ko = bodiesKo.map((t) => t.trim()).filter(Boolean);
  const en = bodiesEn.map((t) => t.trim()).filter(Boolean);
  return {
    bodyKo: ko.length ? ko.join(sepKo) : "",
    bodyEn: en.length ? en.join(sepEn) : "",
  };
}

function metaToPane(
  meta: MetaRow | null,
  contentType: "sct" | "hstd" | "hsfd",
  rows: ContentRow[],
): Pane | null {
  if (!meta) return null;
  const prevKo = pickText(rows, contentType, "kor");
  const prevEn = pickText(rows, contentType, "eng");
  const fallbackKo =
    [meta.manl_ut_tpcd_nm, meta.manl_ut_sgn].filter(Boolean).join(" ") ||
    "HS 해설";
  const fallbackEn = `${meta.manl_ut_sgn ?? ""}`.trim() || "HS Explanatory Notes";
  const titleKo = hsManualPaneTitleFromBody(prevKo, fallbackKo);
  const titleEn = hsManualPaneTitleFromBody(prevEn, fallbackEn);
  const bodyKo = prevKo || "(국문 본문 없음)";
  const bodyEn = prevEn || "(영문 본문 없음)";
  const fr = pickText(rows, contentType, "frn");
  const jp = pickText(rows, contentType, "jpn");
  const otherParts = [fr, jp].filter(Boolean);
  const other =
    otherParts.join("\n\n---\n\n") || "(기타 언어 본문 없음)";
  return { titleKo, titleEn, bodyKo, bodyEn, other };
}

function chapterSgnFromMeta(m: MetaRow): string | null {
  if (m.manl_ut_tpcd === "02") return m.manl_ut_sgn.trim();
  if (m.manl_ut_tpcd === "03") {
    const d = m.manl_ut_sgn.replace(/\D/g, "");
    const head = d.slice(0, 2) || m.manl_ut_sgn.slice(0, 2);
    return head.padStart(2, "0");
  }
  return null;
}

function aggregateHeadingPane(
  headingMetas: MetaRow[],
  contentByMetaId: Map<number, ContentRow[]>,
  chapterPrefix: string,
): Pane | null {
  if (!headingMetas.length) return null;
  const sepKo = "\n\n\n";
  const sepEn = "\n\n\n";
  const titleKo = `제 ${chapterPrefix} 류 — 호 해설 (${headingMetas.length}개 호)`;
  const titleEn = `Chapter ${chapterPrefix} — heading notes (${headingMetas.length} headings)`;
  const bodiesKo: string[] = [];
  const bodiesEn: string[] = [];
  for (const hm of headingMetas) {
    const rows = contentByMetaId.get(hm.id) ?? [];
    const ko = pickText(rows, "hsfd", "kor");
    const en = pickText(rows, "hsfd", "eng");
    if (ko) bodiesKo.push(`━━ ${hm.manl_ut_sgn} ━━\n\n${ko}`);
    if (en) bodiesEn.push(`━━ ${hm.manl_ut_sgn} ━━\n\n${en}`);
  }
  const { bodyKo, bodyEn } = mergeHeadingBodies(sepKo, sepEn, bodiesKo, bodiesEn);
  const otherParts: string[] = [];
  for (const hm of headingMetas) {
    const rows = contentByMetaId.get(hm.id) ?? [];
    const fr = pickText(rows, "hsfd", "frn");
    const jp = pickText(rows, "hsfd", "jpn");
    if (fr) otherParts.push(`━━ ${hm.manl_ut_sgn} (FR)\n\n${fr}`);
    if (jp) otherParts.push(`━━ ${hm.manl_ut_sgn} (JP)\n\n${jp}`);
  }
  return {
    titleKo,
    titleEn,
    bodyKo: bodyKo || "(국문 호 해설 없음)",
    bodyEn: bodyEn || "(영문 호 해설 없음)",
    other: otherParts.join("\n\n---\n\n") || "(기타 언어 호 해설 없음)",
  };
}

const GNPR_SQL = `SELECT gnpr_srno, lang_code, content_text FROM hs_manual_gnpr
     WHERE aply_year = ? AND lang_code IN ('kor','eng','frn','jpn')
     ORDER BY CAST(gnpr_srno AS INTEGER), lang_code`;

async function loadGnprRows(
  db: SmartLawDb,
  aplyYear: string,
): Promise<
  { gnpr_srno: string; lang_code: string; content_text: string | null }[]
> {
  if (!(await smartLawTableExists(db, "hs_manual_gnpr"))) return [];
  return (await db.all(GNPR_SQL, [aplyYear])) as {
    gnpr_srno: string;
    lang_code: string;
    content_text: string | null;
  }[];
}

function asMeta(row: Record<string, unknown> | undefined): MetaRow | null {
  if (!row) return null;
  return {
    id: Number(row.id),
    aply_year: String(row.aply_year ?? ""),
    manl_orgn_tpcd: (row.manl_orgn_tpcd as string | null) ?? null,
    manl_orgn_tpcd_nm: (row.manl_orgn_tpcd_nm as string | null) ?? null,
    manl_ut_tpcd: String(row.manl_ut_tpcd ?? ""),
    manl_ut_tpcd_nm: (row.manl_ut_tpcd_nm as string | null) ?? null,
    manl_ut_sgn: String(row.manl_ut_sgn ?? ""),
    display_title: (row.display_title as string | null) ?? null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const u = request.nextUrl.searchParams;
    const id = Number(u.get("id") ?? "");
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json(
        { ok: false, error: "id( hs_manual_meta.id )가 필요합니다." },
        { status: 400 },
      );
    }

    const division = (u.get("division") ?? "WCO").trim() || "WCO";

    const payload = await withTariffDb(async (db) => {
      const cur = asMeta(
        await db.get(`SELECT * FROM hs_manual_meta WHERE id = ? LIMIT 1`, [id]),
      );
      if (!cur) return null;

      const y = cur.aply_year;
      const tpcd = cur.manl_orgn_tpcd ?? "";
      const secSgn = sectionCodeFromHsSgn(cur.manl_ut_tpcd, cur.manl_ut_sgn);
      const chSgn = chapterSgnFromMeta(cur);

      const getMetaId = async (
        ut: "01" | "02" | "03",
        sgn: string,
      ): Promise<number | null> => {
        const row = await db.get(
          `SELECT id FROM hs_manual_meta
           WHERE aply_year = ? AND COALESCE(manl_orgn_tpcd, '') = COALESCE(?, '')
             AND manl_ut_tpcd = ? AND manl_ut_sgn = ?
           LIMIT 1`,
          [y, tpcd, ut, sgn],
        );
        return row?.id != null ? Number(row.id) : null;
      };

      let sectionId: number | null = null;
      let chapterId: number | null = null;
      let headingId: number | null = null;

      if (cur.manl_ut_tpcd === "01") {
        sectionId = cur.id;
      } else {
        sectionId = await getMetaId("01", secSgn);
      }

      if (cur.manl_ut_tpcd === "02") {
        chapterId = cur.id;
      } else if (cur.manl_ut_tpcd === "03" && chSgn) {
        chapterId = await getMetaId("02", chSgn);
      } else if (cur.manl_ut_tpcd === "01") {
        const ch0 = firstChapterCodeForSection(secSgn);
        chapterId = await getMetaId("02", ch0);
      }

      if (cur.manl_ut_tpcd === "03") {
        headingId = cur.id;
      }

      const chCodeAgg =
        cur.manl_ut_tpcd === "02" && chSgn
          ? chSgn.padStart(2, "0")
          : cur.manl_ut_tpcd === "01"
            ? firstChapterCodeForSection(secSgn)
            : null;

      let headingMetaIds: number[] = [];
      if (headingId != null) {
        headingMetaIds = [headingId];
      } else if (chCodeAgg) {
        if (cur.manl_ut_tpcd === "01" || cur.manl_ut_tpcd === "02") {
          const firstHeading = await db.get(
            `SELECT id FROM hs_manual_meta
             WHERE aply_year = ? AND COALESCE(manl_orgn_tpcd, '') = COALESCE(?, '')
               AND manl_ut_tpcd = '03'
               AND length(trim(manl_ut_sgn)) = 4
               AND substr(trim(manl_ut_sgn), 1, 2) = ?
             ORDER BY trim(manl_ut_sgn)
             LIMIT 1`,
            [y, tpcd, chCodeAgg],
          );
          headingMetaIds = firstHeading?.id != null ? [Number(firstHeading.id)] : [];
        } else {
          const hRows = await db.all(
            `SELECT id FROM hs_manual_meta
             WHERE aply_year = ? AND COALESCE(manl_orgn_tpcd, '') = COALESCE(?, '')
               AND manl_ut_tpcd = '03'
               AND length(trim(manl_ut_sgn)) = 4
               AND substr(trim(manl_ut_sgn), 1, 2) = ?
             ORDER BY trim(manl_ut_sgn)`,
            [y, tpcd, chCodeAgg],
          );
          headingMetaIds = hRows.map((r) => Number(r.id));
        }
      }

      const metaIds = [
        sectionId,
        chapterId,
        ...headingMetaIds,
      ].filter((x): x is number => x != null);
      const uniqMeta = [...new Set(metaIds)];

      let allContent: ContentRow[] = [];
      if (uniqMeta.length) {
        const ph = uniqMeta.map(() => "?").join(",");
        allContent = (await db.all(
          `SELECT meta_id, content_type, lang_code, content_text
           FROM hs_manual_content WHERE meta_id IN (${ph})`,
          uniqMeta,
        )) as ContentRow[];
      }

      const byMeta = (mid: number | null) =>
        mid == null ? [] : allContent.filter((c) => c.meta_id === mid);

      const contentByMetaId = new Map<number, ContentRow[]>();
      for (const c of allContent) {
        const arr = contentByMetaId.get(c.meta_id) ?? [];
        arr.push(c);
        contentByMetaId.set(c.meta_id, arr);
      }

      const sectionMeta =
        sectionId == null
          ? null
          : asMeta(
              await db.get(`SELECT * FROM hs_manual_meta WHERE id = ?`, [
                sectionId,
              ]),
            );
      const chapterMeta =
        chapterId == null
          ? null
          : asMeta(
              await db.get(`SELECT * FROM hs_manual_meta WHERE id = ?`, [
                chapterId,
              ]),
            );
      const headingMetaSingle =
        headingId == null
          ? null
          : asMeta(
              await db.get(`SELECT * FROM hs_manual_meta WHERE id = ?`, [
                headingId,
              ]),
            );

      const headingMetasOrdered: MetaRow[] =
        headingId != null && headingMetaSingle
          ? [headingMetaSingle]
          : headingMetaIds.length
            ? ((
                await db.all(
                  `SELECT * FROM hs_manual_meta WHERE id IN (${headingMetaIds.map(() => "?").join(",")})
                   ORDER BY trim(manl_ut_sgn)`,
                  headingMetaIds,
                )
              )
                .map((r) => asMeta(r))
                .filter((x): x is MetaRow => x != null))
            : [];

      const section = metaToPane(sectionMeta, "sct", byMeta(sectionId));
      const chapter = metaToPane(chapterMeta, "hstd", byMeta(chapterId));
      const heading =
        headingMetasOrdered.length === 1
          ? metaToPane(
              headingMetasOrdered[0] ?? null,
              "hsfd",
              byMeta(headingMetasOrdered[0]?.id ?? null),
            )
          : aggregateHeadingPane(
              headingMetasOrdered,
              contentByMetaId,
              chCodeAgg ?? "",
            );

      const gnprRows = await loadGnprRows(db, y);

      const gnprBySr = new Map<string, { kor?: string; eng?: string }>();
      for (const r of gnprRows) {
        const t = (r.content_text ?? "").trim();
        if (!t) continue;
        let e = gnprBySr.get(r.gnpr_srno);
        if (!e) {
          e = {};
          gnprBySr.set(r.gnpr_srno, e);
        }
        if (r.lang_code === "kor") e.kor = t;
        if (r.lang_code === "eng") e.eng = t;
      }

      const srs = [...gnprBySr.keys()].sort((a, b) => Number(a) - Number(b));
      const tongchimAvailable = srs.length > 0;
      const partsKo: string[] = [];
      const partsEn: string[] = [];
      for (const sr of srs) {
        const e = gnprBySr.get(sr)!;
        if (e.kor) partsKo.push(`통칙 제${sr}호\n\n${e.kor}`);
        if (e.eng) partsEn.push(`General Rule ${sr}\n\n${e.eng}`);
      }
      const bodyKo =
        partsKo.join("\n\n\n") ||
        "(이 연도·기관에 대한 HS 통칙 국문이 DB에 없습니다.)";
      const bodyEn =
        partsEn.join("\n\n\n") ||
        "(No English general rules text in DB for this year.)";

      const tongchim = {
        available: tongchimAvailable,
        message: tongchimAvailable
          ? ""
          : "HS 통칙 본문이 없습니다. hs_manual_gnpr 테이블과 메타 적용연도(aply_year)에 맞는 행을 확인해 주세요.",
        panes: {
          titleKo: "HS해석에 관한 통칙",
          titleEn:
            "GENERAL RULES FOR THE INTERPRETATION OF THE HARMONIZED SYSTEM",
          bodyKo,
          bodyEn,
          other: "",
        } satisfies Pane,
      };

      const yearNum = Number(y);
      const sourceLabel = `${Number.isFinite(yearNum) ? yearNum : y}년도 ${division === "KR" ? "한국" : "WCO"} 해설서`;

      return {
        ok: true as const,
        id: cur.id,
        year: Number.isFinite(yearNum) ? yearNum : y,
        sourceLabel,
        tongchim,
        section,
        chapter,
        heading,
      };
    });

    if (!payload) {
      return NextResponse.json(
        { ok: false, error: "해당 레코드를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    return NextResponse.json(payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("tariff/hs-explanatory/detail:", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
