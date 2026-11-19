import { NextRequest, NextResponse } from "next/server";
import {
  batchFetchLawIdsForGeneralLaws,
  countGeneralLawWithoutId,
} from "@/app/lib/api-management-batch-law-id";
import {
  listGwanselawItemsFromDb,
  saveGwanselawItemsToDb,
} from "@/app/lib/gwanselaw-list-server";
import {
  prepareApiManagementList,
  type ApiManagementListItem,
} from "@/app/shared/api-management-list";

export const runtime = "nodejs";
export const maxDuration = 300;

type BatchBody = {
  /** 미지정 시 DB 전체 처리 */
  apiList?: ApiManagementListItem[];
  delayMs?: number;
  /** 테스트용 상한 */
  limit?: number;
  /** false면 조회만 하고 DB 저장 안 함 */
  save?: boolean;
};

/**
 * 구분=일반법령 이고 lawId 없는 항목에 대해 법령ID·약칭명 일괄 조회 후 gwanselaw_list 저장
 * POST /api/api-management/fetch-law-id-batch
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as BatchBody;
    const save = body.save !== false;

    let items: ApiManagementListItem[];
    if (Array.isArray(body.apiList) && body.apiList.length > 0) {
      items = prepareApiManagementList(body.apiList);
    } else {
      items = await listGwanselawItemsFromDb();
    }

    const { items: nextItems, summary } = await batchFetchLawIdsForGeneralLaws(
      items,
      {
        delayMs: body.delayMs,
        limit: body.limit,
      },
    );

    if (save) {
      await saveGwanselawItemsToDb(nextItems);
    }

    return NextResponse.json({
      ok: true,
      saved: save,
      storage: save ? "sqlite" : undefined,
      table: save ? "gwanselaw_list" : undefined,
      ...summary,
    });
  } catch (error) {
    console.error("fetch-law-id-batch:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * 일괄 대상 건수 미리보기
 * GET /api/api-management/fetch-law-id-batch
 */
export async function GET() {
  try {
    const items = await listGwanselawItemsFromDb();
    const count = countGeneralLawWithoutId(items);
    return NextResponse.json({ ok: true, count });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
