import { NextRequest, NextResponse } from "next/server";
import { hsCodeNumericOrderSql } from "@/app/tariff/lib/tariff-hs-display";
import {
  tariffScheduleTableExists,
  withTariffScheduleDb,
} from "@/app/tariff/lib/tariff-schedule-db";
import {
  scheduleCountryPred,
  scheduleYearPred,
} from "@/app/tariff/lib/tariff-schedule-sql";

export const runtime = "nodejs";

/** 호 선택 시 세부 품목·세율: tariff_item */
export async function GET(request: NextRequest) {
  try {
    const u = request.nextUrl.searchParams;
    const countryCode = (u.get("countryCode") ?? "KR").trim().toUpperCase();
    const year = Number(u.get("year") ?? "");
    const headingCodeRaw = (u.get("headingCode") ?? "").replace(/\D/g, "");
    const headingCode =
      headingCodeRaw.length >= 4
        ? headingCodeRaw.slice(0, 4)
        : headingCodeRaw.length > 0
          ? headingCodeRaw.padStart(4, "0")
          : "";

    if (
      !countryCode ||
      !Number.isFinite(year) ||
      year <= 0 ||
      headingCode.length !== 4
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "countryCode, year, headingCode(4자리 호)가 필요합니다.",
        },
        { status: 400 },
      );
    }

    const result = await withTariffScheduleDb(async (db) => {
      if (!(await tariffScheduleTableExists(db, "tariff_item"))) {
        return { missing: true as const };
      }

      const hiNum = parseInt(headingCode, 10);
      const rows = await db.all(
        `SELECT hs_code,
                IFNULL(item_name_en,'') AS item_name_en,
                item_name,
                IFNULL(basic_rate,'') AS basic_rate,
                IFNULL(elastic_rate,'') AS elastic_rate,
                IFNULL(elastic_codes,'') AS elastic_codes,
                IFNULL(elastic_rates,'') AS elastic_rates,
                '' AS fta_rate,
                '' AS temp_rate,
                '' AS special_rate
         FROM tariff_item t
         WHERE ${scheduleYearPred("t")}
           AND ${scheduleCountryPred("t")}
           AND (TRIM(IFNULL(t.heading_code,'')) = TRIM(IFNULL(?, ''))
             OR CAST(TRIM(IFNULL(t.heading_code,'')) AS INTEGER) = CAST(? AS INTEGER))
         ORDER BY ${hsCodeNumericOrderSql("t.hs_code")}`,
        [year, countryCode, headingCode, hiNum],
      );
      return { missing: false as const, rows };
    });

    if (result.missing) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "DB에 tariff_item 테이블이 없습니다. 스키마·데이터 적재 여부를 확인하세요.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      countryCode,
      year,
      headingCode,
      items: result.rows,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("tariff/schedule/items:", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
