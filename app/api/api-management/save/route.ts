import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import {
  getGwanselawListDbPath,
  listAndPersistDedupedGwanselawItems,
  saveGwanselawItemsToDb,
  countGwanselawItemsInDb,
} from "@/app/lib/gwanselaw-list-server";
import { syncClipGeneralLawExcelRowsToGwanselaw } from "@/app/lib/clip-general-law-sync-server";
import {
  syncLawStatuteCrawlTargetsToGwanselaw,
  syncOpenlawInquiryListToGwanselaw,
} from "@/app/lib/law-statute-crawl-sync-server";
import type { ApiManagementListItem } from "@/app/shared/api-management-list";

type SaveRequestBody = {
  apiList: (Partial<ApiManagementListItem> & Record<string, unknown>)[];
};

const LEGACY_JSON = path.join(process.cwd(), "data", "api-management-list.json");

export const runtime = "nodejs";

async function loadFromLegacyJsonIfEmpty(): Promise<void> {
  if ((await countGwanselawItemsInDb()) > 0) return;

  try {
    const raw = await readFile(LEGACY_JSON, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return;
    await saveGwanselawItemsToDb(parsed);
    console.info(
      `[gwanselaw_list] legacy JSON ${parsed.length}건을 DB로 이전했습니다.`,
    );
  } catch {
    // JSON 없음 — 빈 테이블 유지
  }
}

export async function GET(request: NextRequest) {
  try {
    await loadFromLegacyJsonIfEmpty();

    const syncLawCrawlTargets =
      request.nextUrl.searchParams.get("syncLawCrawlTargets") === "1";
    let crawlSync:
      | Awaited<ReturnType<typeof syncLawStatuteCrawlTargetsToGwanselaw>>
      | undefined;
    let openlawSync:
      | Awaited<ReturnType<typeof syncOpenlawInquiryListToGwanselaw>>
      | undefined;
    let clipExcelSync:
      | Awaited<ReturnType<typeof syncClipGeneralLawExcelRowsToGwanselaw>>
      | undefined;
    if (syncLawCrawlTargets) {
      // 일반법령리스트v5(엑셀 행·메뉴중복 포함) → gwanselaw_list
      clipExcelSync = await syncClipGeneralLawExcelRowsToGwanselaw();
      crawlSync = await syncLawStatuteCrawlTargetsToGwanselaw();
      openlawSync = await syncOpenlawInquiryListToGwanselaw();
    }

    const { data, deduped, beforeCount, afterCount } =
      await listAndPersistDedupedGwanselawItems();

    return NextResponse.json({
      ok: true,
      storage: "db",
      table: "gwanselaw_list",
      dbPath: getGwanselawListDbPath(),
      data,
      crawlSync,
      openlawSync,
      clipExcelSync,
      ...(deduped
        ? {
            deduped: true,
            message: `동일 법령명 중복 ${beforeCount - afterCount}건을 정리했습니다. (${beforeCount}→${afterCount})`,
          }
        : {}),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "DB 조회 중 오류가 발생했습니다.";

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SaveRequestBody;

    if (!Array.isArray(body.apiList)) {
      return NextResponse.json(
        {
          ok: false,
          error: "apiList 배열이 필요합니다.",
        },
        { status: 400 },
      );
    }

    const apiList = await saveGwanselawItemsToDb(body.apiList);

    return NextResponse.json({
      ok: true,
      message: "gwanselaw_list 저장 완료",
      storage: "db",
      table: "gwanselaw_list",
      dbPath: getGwanselawListDbPath(),
      count: apiList.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "DB 저장 중 오류가 발생했습니다.";

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 },
    );
  }
}
