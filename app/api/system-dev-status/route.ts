import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_SYSTEM_DEV_STATUS_EXCEL_PATH,
  DEFAULT_SYSTEM_DEV_STATUS_SHEET,
  DEFAULT_SYSTEM_DEV_STATUS_YEAR,
  deleteSystemDevStatusItem,
  ensureSystemDevStatusSeededFromExcel,
  getSystemDevStatusDbPath,
  importSystemDevStatusFromExcel,
  listSystemDevStatusHistory,
  listSystemDevStatusItems,
  listSystemDevStatusYears,
  upsertSystemDevStatusItem,
} from "@/app/lib/system-dev-status-server";
import {
  getSystemDevStatusDefaultInquiryYear,
  type SystemDevStatusItem,
} from "@/app/shared/system-dev-status-types";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const historyStatusId = params.get("historyStatusId");
    if (historyStatusId) {
      const statusId = Number(historyStatusId);
      if (!statusId) {
        return NextResponse.json(
          { ok: false, message: "historyStatusId가 필요합니다." },
          { status: 400 },
        );
      }
      const history = listSystemDevStatusHistory(statusId);
      return NextResponse.json({ ok: true, statusId, history });
    }

    const yearParam = params.get("year");
    const inquiryDefaultYear = getSystemDevStatusDefaultInquiryYear();
    const year = yearParam
      ? Number(yearParam)
      : inquiryDefaultYear;
    const autoSeed = params.get("autoSeed") !== "0";
    let seedInfo: ReturnType<typeof ensureSystemDevStatusSeededFromExcel> | undefined;
    if (autoSeed && year === DEFAULT_SYSTEM_DEV_STATUS_YEAR) {
      seedInfo = ensureSystemDevStatusSeededFromExcel(
        DEFAULT_SYSTEM_DEV_STATUS_YEAR,
      );
    }

    const data = listSystemDevStatusItems({
      year,
      systemName: params.get("system") ?? undefined,
      workArea: params.get("workArea") ?? undefined,
      q: params.get("q") ?? undefined,
    });

    return NextResponse.json({
      ok: true,
      storage: "sqlite",
      table: "system_dev_status",
      dbPath: getSystemDevStatusDbPath(),
      defaultExcelPath: DEFAULT_SYSTEM_DEV_STATUS_EXCEL_PATH,
      defaultSheet: DEFAULT_SYSTEM_DEV_STATUS_SHEET,
      defaultYear: DEFAULT_SYSTEM_DEV_STATUS_YEAR,
      defaultInquiryYear: inquiryDefaultYear,
      year,
      years: listSystemDevStatusYears(),
      count: data.length,
      data,
      seedInfo,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "조회 중 오류가 발생했습니다.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

type PostBody =
  | { action: "save"; item: SystemDevStatusItem; changedBy?: string }
  | { action: "delete"; id: number; changedBy?: string }
  | {
      action: "importExcel";
      filePath?: string;
      sheetName?: string;
      replaceAll?: boolean;
      year?: number;
    };

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as PostBody;

    if (body.action === "delete") {
      const id = Number(body.id);
      if (!id) {
        return NextResponse.json(
          { ok: false, message: "id가 필요합니다." },
          { status: 400 },
        );
      }
      deleteSystemDevStatusItem(id, { changedBy: body.changedBy });
      return NextResponse.json({ ok: true, message: "삭제되었습니다." });
    }

    if (body.action === "importExcel") {
      const year = body.year ?? DEFAULT_SYSTEM_DEV_STATUS_YEAR;
      const result = importSystemDevStatusFromExcel({
        filePath: body.filePath,
        sheetName: body.sheetName,
        replaceAll: body.replaceAll ?? false,
        year,
      });
      const data = listSystemDevStatusItems({ year });
      return NextResponse.json({
        ok: true,
        message: `${result.year}년 · 엑셀 ${result.imported}건 반영 (건너뜀 ${result.skipped}건)`,
        importResult: result,
        count: data.length,
        data,
      });
    }

    if (body.action === "save" && body.item) {
      const saved = upsertSystemDevStatusItem(body.item, {
        changedBy: body.changedBy,
      });
      return NextResponse.json({
        ok: true,
        message: "저장되었습니다.",
        item: saved,
      });
    }

    return NextResponse.json(
      { ok: false, message: "알 수 없는 요청입니다." },
      { status: 400 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "처리 중 오류가 발생했습니다.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
