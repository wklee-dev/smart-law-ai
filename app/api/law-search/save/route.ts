import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";
import { normalizeLawIdForStorage } from "@/app/shared/law-id";

type SearchMeta = {
  target: string;
  keyword: string;
  section: string;
  totalCnt: number;
  page: number;
  numOfRows: number;
  resultCode: string;
  resultMsg: string;
  requestedUrl: string;
};

type LawListItem = {
  itemNo: number;
  lawSerialNo: string;
  historyStatusCode: string;
  lawNameKr: string;
  lawNameShort: string;
  lawId: string;
  promulgationDate: string;
  promulgationNo: string;
  revisionTypeName: string;
  ministryCode: string;
  ministryName: string;
  lawTypeName: string;
  enforcementDate: string;
  detailLink: string;
};

type SaveRequestBody = {
  searchMeta: SearchMeta;
  items: LawListItem[];
  rawXml: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SaveRequestBody;

    if (!body.searchMeta) {
      return NextResponse.json(
        { ok: false, error: "searchMeta가 필요합니다." },
        { status: 400 },
      );
    }

    if (!Array.isArray(body.items)) {
      return NextResponse.json(
        { ok: false, error: "items 배열이 필요합니다." },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: historyRow, error: historyError } = await supabase
      .from("law_search_histories")
      .insert({
        target: body.searchMeta.target,
        keyword: body.searchMeta.keyword,
        section: body.searchMeta.section,
        total_count: body.searchMeta.totalCnt,
        page: body.searchMeta.page,
        num_of_rows: body.searchMeta.numOfRows,
        result_code: body.searchMeta.resultCode,
        result_message: body.searchMeta.resultMsg,
        requested_url: body.searchMeta.requestedUrl,
        raw_xml: body.rawXml,
      })
      .select("id")
      .single();

    if (historyError) {
      throw historyError;
    }

    const historyId = historyRow.id;

    if (body.items.length > 0) {
      const rows = body.items.map((item) => ({
        search_history_id: historyId,
        item_no: item.itemNo,
        law_serial_no: item.lawSerialNo,
        history_status_code: item.historyStatusCode,
        law_name_kr: item.lawNameKr,
        law_name_short: item.lawNameShort,
        law_id: normalizeLawIdForStorage(item.lawId),
        promulgation_date: item.promulgationDate,
        promulgation_no: item.promulgationNo,
        revision_type_name: item.revisionTypeName,
        ministry_code: item.ministryCode,
        ministry_name: item.ministryName,
        law_type_name: item.lawTypeName,
        enforcement_date: item.enforcementDate,
        detail_link: item.detailLink,
      }));

      const { error: itemError } = await supabase
        .from("law_search_items")
        .insert(rows);

      if (itemError) {
        throw itemError;
      }
    }

    return NextResponse.json({
      ok: true,
      searchHistoryId: historyId,
      savedCount: body.items.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "저장 중 오류가 발생했습니다.";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}