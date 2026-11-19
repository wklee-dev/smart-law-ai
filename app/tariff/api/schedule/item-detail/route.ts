import { NextRequest, NextResponse } from "next/server";
import { formatTariffUnitWeightQty } from "@/app/tariff/lib/tariff-hs-display";
import { withTariffScheduleDb } from "@/app/tariff/lib/tariff-schedule-db";
import {
  scheduleCountryPred,
  scheduleYearPred,
} from "@/app/tariff/lib/tariff-schedule-sql";

export const runtime = "nodejs";

function normalizeHs(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** HS 품목 상세: tariff_item + tariff_item_detail + tariff_req_condition + tariff_req_strategic */
export async function GET(request: NextRequest) {
  try {
    const u = request.nextUrl.searchParams;
    const countryCode = (u.get("countryCode") ?? "KR").trim().toUpperCase();
    const year = Number(u.get("year") ?? "");
    const hsCode = normalizeHs(u.get("hsCode") ?? "");

    if (
      !countryCode ||
      !Number.isFinite(year) ||
      year <= 0 ||
      hsCode.length < 10
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "countryCode, year, hsCode(10자리)가 필요합니다.",
        },
        { status: 400 },
      );
    }

    const payload = await withTariffScheduleDb(async (db) => {
      const item = (await db.get(
        `SELECT hs_code,
                IFNULL(item_name,'') AS item_name,
                IFNULL(item_name_en,'') AS item_name_en,
                IFNULL(basic_rate,'') AS basic_rate,
                IFNULL(elastic_rate,'') AS elastic_rate,
                IFNULL(heading_code,'') AS heading_code,
                IFNULL(chapter_code,'') AS chapter_code,
                IFNULL(section_code,'') AS section_code,
                IFNULL(country_name,'') AS country_name,
                IFNULL(simple_refund,'') AS simple_refund,
                IFNULL(reduction,'') AS reduction,
                IFNULL(origin,'') AS origin,
                IFNULL(unit_weight,'') AS unit_weight,
                IFNULL(unit_qty,'') AS unit_qty
         FROM tariff_item t
         WHERE ${scheduleYearPred("t")}
           AND ${scheduleCountryPred("t")}
           AND replace(trim(t.hs_code),' ','') = ?
         LIMIT 1`,
        [year, countryCode, hsCode],
      )) as
        | {
            hs_code: string;
            item_name: string;
            item_name_en: string;
            basic_rate: string;
            elastic_rate: string;
            heading_code: string;
            chapter_code: string;
            section_code: string;
            country_name: string;
            simple_refund: string;
            reduction: string;
            origin: string;
            unit_weight: string;
            unit_qty: string;
          }
        | undefined;

      if (!item) return null;

      const rates = await db.all(
        `SELECT IFNULL(rate_code,'') AS rate_code,
                IFNULL(rate_value,'') AS rate_value,
                IFNULL(rate_name,'') AS rate_name
         FROM tariff_item_detail d
         WHERE ${scheduleYearPred("d")}
           AND ${scheduleCountryPred("d")}
           AND replace(trim(d.hs_code),' ','') = ?
         ORDER BY CASE UPPER(TRIM(d.rate_code))
                    WHEN 'A' THEN 1
                    WHEN 'C' THEN 2
                    WHEN 'R' THEN 3
                    WHEN 'U' THEN 4
                    ELSE 5
                  END,
                  d.rate_code`,
        [year, countryCode, hsCode],
      );

      const reqConditions = (await db.all(
        `SELECT IFNULL(req_type,'') AS req_type,
                IFNULL(req_category,'') AS req_category,
                IFNULL(req_content,'') AS req_content
         FROM tariff_req_condition c
         WHERE ${scheduleYearPred("c")}
           AND ${scheduleCountryPred("c")}
           AND replace(trim(c.hs_code),' ','') = ?
         ORDER BY req_type, req_category`,
        [year, countryCode, hsCode],
      )) as {
        req_type: string;
        req_category: string;
        req_content: string;
      }[];

      const strategic = await db.all(
        `SELECT IFNULL(cls_no,'') AS cls_no,
                IFNULL(item_name,'') AS item_name,
                IFNULL(ctrl_name,'') AS ctrl_name,
                IFNULL(model_spec,'') AS model_spec,
                IFNULL(ctrl_detail,'') AS ctrl_detail,
                IFNULL(manufacturer,'') AS manufacturer,
                IFNULL(remark,'') AS remark
         FROM tariff_req_strategic s
         WHERE ${scheduleYearPred("s")}
           AND ${scheduleCountryPred("s")}
           AND replace(trim(s.hs_code),' ','') = ?
         ORDER BY cls_no`,
        [year, countryCode, hsCode],
      );

      const reqByType: Record<string, typeof reqConditions> = {};
      for (const row of reqConditions) {
        const key = row.req_type.trim() || "기타";
        if (!reqByType[key]) reqByType[key] = [];
        reqByType[key].push(row);
      }

      return { item, rates, reqConditions, reqByType, strategic };
    });

    if (!payload) {
      return NextResponse.json(
        { ok: false, error: "해당 HS 품목을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    const { item, rates, reqConditions, reqByType, strategic } = payload;

    return NextResponse.json({
      ok: true,
      countryCode,
      year,
      hsCode,
      item: {
        hs_code: item.hs_code,
        item_name: item.item_name,
        item_name_en: item.item_name_en,
        basic_rate: item.basic_rate,
        elastic_rate: item.elastic_rate,
        heading_code: item.heading_code,
        chapter_code: item.chapter_code,
        section_code: item.section_code,
        country_name: item.country_name,
        unit: formatTariffUnitWeightQty(item.unit_weight, item.unit_qty),
        unit_weight: item.unit_weight,
        unit_qty: item.unit_qty,
        simplified_drawback: item.simple_refund,
        exemption: item.reduction,
        origin: item.origin,
      },
      rates,
      reqConditions,
      reqByType,
      strategic,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("tariff/schedule/item-detail:", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
