import { NextRequest, NextResponse } from "next/server";
import type { SmartLawDb } from "@/app/lib/smart-law-db";
import { withTariffDb } from "@/app/tariff/lib/tariff-db";
import {
  hsManualOrgClause,
  maxAplyYearNotAfterTariffSchedule,
  signLookupCandidates,
} from "@/app/tariff/lib/hs-manual-aply-year";
import { scheduleCalendarYear } from "@/app/tariff/lib/tariff-schedule-period";

export const runtime = "nodejs";

async function pickAplyYearStr(
  db: SmartLawDb,
  orgSql: string,
  orgParams: unknown[],
  preferred: number,
): Promise<string> {
  const years = (
    await db.all(
      `SELECT DISTINCT CAST(m.aply_year AS INTEGER) AS y
       FROM hs_manual_meta m
       WHERE ${orgSql}
       ORDER BY y DESC`,
      orgParams,
    )
  )
    .map((r) => Number(r.y))
    .filter((y) => Number.isFinite(y) && y > 0);

  if (!years.length) return String(preferred);
  if (years.includes(preferred)) return String(preferred);

  const notAfter = years.filter((y) => y <= preferred);
  if (notAfter.length) {
    return String(notAfter.sort((a, b) => b - a)[0]);
  }
  return String(years[0]);
}

async function resolveMetaRowIdWithOrg(params: {
  db: SmartLawDb;
  division: string;
  aplyYearStr: string;
  ut: string;
  signCandidates: string[];
}): Promise<{ id: number; matchedSgn: string } | null> {
  const { db, division, aplyYearStr, ut, signCandidates } = params;
  const org = hsManualOrgClause(division);

  for (const sgc of signCandidates) {
    const row = await db.get(
      `SELECT m.id
       FROM hs_manual_meta m
       WHERE CAST(TRIM(m.aply_year) AS INTEGER) = CAST(? AS INTEGER)
         AND ${org.sql}
         AND m.manl_ut_tpcd = ?
         AND trim(m.manl_ut_sgn) = ?
       LIMIT 1`,
      [aplyYearStr, ...org.params, ut, sgc.trim()],
    );
    if (row?.id != null)
      return { id: Number(row.id), matchedSgn: sgc.trim() };
  }
  return null;
}

async function resolveMetaRowIdIgnoringOrg(params: {
  db: SmartLawDb;
  aplyYearInt: number;
  ut: string;
  signCandidates: string[];
}): Promise<{ id: number } | null> {
  const { db, aplyYearInt, ut, signCandidates } = params;
  for (const sgc of signCandidates) {
    const row = await db.get(
      `SELECT m.id
       FROM hs_manual_meta m
       WHERE CAST(TRIM(m.aply_year) AS INTEGER) = ?
         AND m.manl_ut_tpcd = ?
         AND trim(m.manl_ut_sgn) = ?
       ORDER BY m.id ASC
       LIMIT 1`,
      [aplyYearInt, ut, sgc.trim()],
    );
    if (row?.id != null) return { id: Number(row.id) };
  }
  return null;
}

/**
 * HS 해설 상세 API에 넘길 `hs_manual_meta.id` 를 조회합니다.
 */
export async function GET(request: NextRequest) {
  try {
    const u = request.nextUrl.searchParams;
    const divisionRaw = (u.get("division") ?? "KR").trim() || "KR";
    const scheduleYear = Number(u.get("scheduleYear") ?? "");
    const chapterCode = (u.get("chapterCode") ?? "")
      .replace(/\D/g, "")
      .slice(0, 2);
    const sectionOnly = (u.get("sectionCode") ?? "").replace(/\D/g, "").slice(0, 2);
    const headingRaw = (u.get("headingCode") ?? "").replace(/\D/g, "");
    const headingCode =
      headingRaw.length >= 4
        ? headingRaw.slice(0, 4)
        : headingRaw.length > 0
          ? headingRaw.padStart(4, "0")
          : "";

    const preferLatestHsManual =
      u.get("preferLatestHsManual") === "1" ||
      u.get("preferLatestHsManual")?.toLowerCase() === "true";

    if (!Number.isFinite(scheduleYear) || scheduleYear <= 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "scheduleYear(양의 정수)가 필요합니다. 관세율표 연도·HS 해설 조회 연도로 사용됩니다.",
        },
        { status: 400 },
      );
    }

    const wantsSectionMeta =
      chapterCode.length !== 2 && sectionOnly.length === 2;

    if (!wantsSectionMeta && chapterCode.length !== 2) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "chapterCode(2자리 류) 또는 부만 조회 시 sectionCode(2자리)가 필요합니다. headingCode 는 선택입니다.",
        },
        { status: 400 },
      );
    }

    const wantsHeading = chapterCode.length === 2 && headingCode.length === 4;
    const ut = wantsSectionMeta ? "01" : wantsHeading ? "03" : "02";
    const sgn = wantsSectionMeta
      ? sectionOnly.padStart(2, "0")
      : wantsHeading
        ? headingCode
        : chapterCode.padStart(2, "0");

    const signCandidates = signLookupCandidates(ut, sgn);

    const result = await withTariffDb(async (db) => {
      const org = hsManualOrgClause(divisionRaw);
      let found: { id: number } | null = null;
      let aplyYearStr: string;

      if (preferLatestHsManual) {
        const cap = await maxAplyYearNotAfterTariffSchedule(db, scheduleYear);
        if (cap == null) {
          return {
            kind: "err" as const,
            body: {
              ok: false,
              error: `HS 해설 적용연도가 관세율표 연도(${scheduleYear}) 이하인 데이터가 없습니다.`,
              tariffScheduleYear: scheduleYear,
              level: wantsSectionMeta
                ? "section"
                : wantsHeading
                  ? "heading"
                  : "chapter",
            },
          };
        }
        found = await resolveMetaRowIdIgnoringOrg({
          db,
          aplyYearInt: cap,
          ut,
          signCandidates,
        });
        aplyYearStr = String(cap);

        if (!found?.id) {
          const levelLabel = wantsSectionMeta
            ? `부 ${sgn}`
            : wantsHeading
              ? `호 ${sgn}`
              : `류 ${sgn}`;
          return {
            kind: "err" as const,
            body: {
              ok: false,
              error: `HS 해설 메타를 찾을 수 없습니다. (적용연도 ${cap} ≤ 율표 ${scheduleYear}, 국가 무시·${levelLabel})`,
              aplyYear: cap,
              tariffScheduleYear: scheduleYear,
              level: wantsSectionMeta
                ? "section"
                : wantsHeading
                  ? "heading"
                  : "chapter",
            },
          };
        }
      } else {
        aplyYearStr = await pickAplyYearStr(
          db,
          org.sql,
          org.params,
          scheduleCalendarYear(scheduleYear),
        );

        found = await resolveMetaRowIdWithOrg({
          db,
          division: divisionRaw,
          aplyYearStr,
          ut,
          signCandidates,
        });

        if (!found?.id) {
          const levelLabel = wantsSectionMeta
            ? `부 ${sgn}`
            : wantsHeading
              ? `호 ${sgn}`
              : `류 ${sgn}`;
          return {
            kind: "err" as const,
            body: {
              ok: false,
              error: `HS 해설 메타를 찾을 수 없습니다. (적용연도 ${aplyYearStr}, ${levelLabel})`,
              aplyYear: Number(aplyYearStr),
              level: wantsSectionMeta
                ? "section"
                : wantsHeading
                  ? "heading"
                  : "chapter",
            },
          };
        }
      }

      const yearNum = Number(aplyYearStr);
      const aplyYear = Number.isFinite(yearNum)
        ? yearNum
        : Number(String(aplyYearStr).trim());

      return {
        kind: "ok" as const,
        body: {
          ok: true,
          id: found.id,
          aplyYear,
          tariffScheduleYear: scheduleYear,
          level: wantsSectionMeta
            ? "section"
            : wantsHeading
              ? "heading"
              : "chapter",
          division: divisionRaw,
        },
      };
    });

    return NextResponse.json(result.body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("tariff/hs-explanatory/resolve-meta:", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
